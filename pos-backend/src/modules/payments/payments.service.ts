import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ClsService } from 'nestjs-cls';
import { CreatePaymentDto } from './dto/create-payment.dto';

const isValidUuid = (val: any): boolean =>
  typeof val === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);

@Injectable()
export class PaymentsService {
  private verifiedRestCache = new Map<string, number>();
  private readonly REST_CACHE_TTL = 5 * 60 * 1000;

  constructor(
    private prisma: PrismaService,
    private cls: ClsService,
  ) {}

  private async resolveRestaurantId(reqUser?: any, restaurantIdParam?: string | null): Promise<string | null> {
    const rawId = restaurantIdParam || reqUser?.restaurantId || this.cls.get('restaurantId');
    if (isValidUuid(rawId)) {
      const cachedTime = this.verifiedRestCache.get(rawId);
      if (cachedTime && Date.now() < cachedTime) {
        return rawId;
      }
      const rest = await this.prisma.restaurant.findUnique({ where: { id: rawId }, select: { id: true } });
      if (rest) {
        this.verifiedRestCache.set(rawId, Date.now() + this.REST_CACHE_TTL);
        return rest.id;
      }
    }

    if (reqUser?.userId && isValidUuid(reqUser.userId)) {
      const user = await this.prisma.user.findUnique({
        where: { id: reqUser.userId },
        select: { restaurantId: true }
      });
      if (user?.restaurantId && isValidUuid(user.restaurantId)) {
        this.verifiedRestCache.set(user.restaurantId, Date.now() + this.REST_CACHE_TTL);
        return user.restaurantId;
      }
    }

    return null;
  }

  async processPayment(data: CreatePaymentDto) {
    const order = await this.prisma.order.findUnique({
      where: { id: data.orderId },
      include: { 
        payments: true,
        items: {
          where: { status: 'ACTIVE' },
          include: {
            product: {
              include: { recipeItems: true }
            }
          }
        }
      },
    });

    if (!order) throw new BadRequestException('La orden no existe');
    if (order.status === 'CLOSED') throw new BadRequestException('Esta cuenta ya está cerrada');

    const newPayment = await this.prisma.payment.create({
      data: {
        orderId: data.orderId,
        amount: data.amount,
        tipAmount: data.tipAmount ?? 0,
        paymentMethod: data.paymentMethod,
      },
    });

    // Marcar items como pagados si vienen en el request (Cuentas separadas)
    if (data.itemIds && data.itemIds.length > 0) {
      await this.prisma.orderItem.updateMany({
        where: { id: { in: data.itemIds } },
        data: { isPaid: true }
      });
    }

    const totalPaid = order.payments.reduce((sum, p) => sum + Number(p.amount), 0) + data.amount;

    if (totalPaid >= Number(order.totalAmount)) {
      // 1. Cerramos la orden y liberamos la mesa
      await Promise.all([
        this.prisma.order.update({ where: { id: order.id }, data: { status: 'CLOSED' } }),
        ...(order.tableId ? [
          this.prisma.table.update({ where: { id: order.tableId }, data: { status: 'FREE' } })
        ] : [])
      ]);

      // ==========================================
      // 2. MOTOR DE INVENTARIO: Descuenta stock del producto Y materias primas
      // ==========================================
      for (const item of order.items) {
        if (!item.product) continue;

        // Descontamos del Producto Directo si tiene stock propio
        await this.prisma.product.update({
          where: { id: item.productId },
          data: { stock: { decrement: item.quantity } },
        });

        // Descontamos de los Insumos (Receta)
        for (const recipeItem of item.product.recipeItems) {
          const totalDeduction = Number(recipeItem.quantityRequired) * item.quantity;
          await this.prisma.inventoryItem.update({
            where: { id: recipeItem.inventoryItemId },
            data: { stockQuantity: { decrement: totalDeduction } },
          });
        }
      }
    }

    return newPayment;
  }

  async getCurrentShift(reqUser?: any, restaurantIdParam?: string | null) {
    const restaurantId = await this.resolveRestaurantId(reqUser, restaurantIdParam);
    if (!restaurantId) return null;

    return this.prisma.cashShift.findFirst({
      where: {
        restaurantId,
        status: 'OPEN',
      },
      include: {
        expenses: {
          orderBy: { createdAt: 'desc' }
        }
      },
      orderBy: { openedAt: 'desc' }
    });
  }

  async openShift(data: { openingAmount: number }, reqUser?: any, restaurantIdParam?: string | null) {
    const restaurantId = await this.resolveRestaurantId(reqUser, restaurantIdParam);
    if (!restaurantId) throw new BadRequestException('Restaurante no identificado');

    // Verificar si ya existe un turno abierto para este restaurante
    const existing = await this.prisma.cashShift.findFirst({
      where: {
        restaurantId,
        status: 'OPEN',
      },
      include: { expenses: true }
    });

    if (existing) {
      return this.prisma.cashShift.update({
        where: { id: existing.id },
        data: { openingAmount: data.openingAmount },
        include: { expenses: true }
      });
    }

    const userId = reqUser?.userId || reqUser?.id || null;

    return this.prisma.cashShift.create({
      data: {
        restaurantId,
        userId: userId && isValidUuid(userId) ? userId : null,
        openingAmount: data.openingAmount,
        status: 'OPEN',
      },
      include: { expenses: true }
    });
  }

  async addExpense(data: { amount: number; description: string }, reqUser?: any, restaurantIdParam?: string | null) {
    const restaurantId = await this.resolveRestaurantId(reqUser, restaurantIdParam);
    if (!restaurantId) throw new BadRequestException('Restaurante no identificado');

    let shift = await this.prisma.cashShift.findFirst({
      where: { restaurantId, status: 'OPEN' },
    });

    if (!shift) {
      shift = await this.prisma.cashShift.create({
        data: {
          restaurantId,
          openingAmount: 0,
          status: 'OPEN',
        }
      });
    }

    return this.prisma.cashExpense.create({
      data: {
        shiftId: shift.id,
        amount: data.amount,
        description: data.description || 'Gasto de caja',
      }
    });
  }

  async closeShift(data: { closureNote?: string }, reqUser?: any, restaurantIdParam?: string | null) {
    const restaurantId = await this.resolveRestaurantId(reqUser, restaurantIdParam);
    if (!restaurantId) throw new BadRequestException('Restaurante no identificado');

    const openShifts = await this.prisma.cashShift.findMany({
      where: { restaurantId, status: 'OPEN' }
    });

    if (openShifts.length > 0) {
      await this.prisma.cashShift.updateMany({
        where: { restaurantId, status: 'OPEN' },
        data: { status: 'CLOSED', closedAt: new Date() }
      });
    }

    return { message: 'Caja cerrada exitosamente', closedCount: openShifts.length };
  }

  async getDailyClosure(dateString?: string, reqUser?: any, restaurantIdParam?: string | null) {
    let startOfDay: Date;
    let endOfDay: Date;

    if (dateString) {
      const parts = dateString.split('-');
      if (parts.length === 3) {
        startOfDay = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 0, 0, 0, 0);
        endOfDay = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 23, 59, 59, 999);
      } else {
        startOfDay = new Date(dateString);
        startOfDay.setHours(0, 0, 0, 0);
        endOfDay = new Date(dateString);
        endOfDay.setHours(23, 59, 59, 999);
      }
    } else {
      startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      endOfDay = new Date();
      endOfDay.setHours(23, 59, 59, 999);
    }

    const restaurantId = await this.resolveRestaurantId(reqUser, restaurantIdParam);
    const paymentWhere: any = { createdAt: { gte: startOfDay, lte: endOfDay } };
    if (restaurantId) {
      paymentWhere.order = { restaurantId };
    }
    const orderWhere: any = { status: 'CLOSED', updatedAt: { gte: startOfDay, lte: endOfDay } };
    if (restaurantId) {
      orderWhere.restaurantId = restaurantId;
    }
    // El turno activo de la caja (cualquiera que esté actualmente OPEN para este restaurante)
    const shiftWhere: any = { status: 'OPEN' };
    if (restaurantId) {
      shiftWhere.restaurantId = restaurantId;
    }

    // ==========================================
    // EJECUCIÓN CONCURRENTE (Optimización de Velocidad)
    // ==========================================
    const [
      paymentsGrouped,
      closedOrdersCount,
      paymentsWithTips,
      activeShift,
      closedOrders
    ] = await Promise.all([
      // 1. Agrupar pagos
      this.prisma.payment.groupBy({
        by: ['paymentMethod'],
        where: paymentWhere,
        _sum: { amount: true, tipAmount: true },
      }),
      // 2. Conteo de órdenes cerradas
      this.prisma.order.count({
        where: orderWhere,
      }),
      // 3. Detalle de Propinas
      this.prisma.payment.findMany({
        where: {
          ...paymentWhere,
          tipAmount: { gt: 0 }, 
        },
        include: {
          order: {
            select: {
              table: { select: { number: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' }
      }),
      // 4. Fondo de caja y gastos activos
      this.prisma.cashShift.findFirst({
        where: shiftWhere,
        include: { expenses: true }
      }),
      // 5. Detalle de todas las órdenes cerradas (select optimizado sin sobrecarga de joins)
      this.prisma.order.findMany({
        where: orderWhere,
        include: {
          table: { select: { id: true, number: true } },
          payments: { select: { id: true, amount: true, tipAmount: true, paymentMethod: true } },
          items: {
            select: {
              id: true,
              quantity: true,
              unitPrice: true,
              subtotal: true,
              productId: true,
              product: { select: { id: true, name: true } }
            }
          }
        },
        orderBy: { updatedAt: 'desc' }
      })
    ]);

    let totalIncome = 0;
    let totalTips = 0;
    const breakdown = { CASH: 0, CARD: 0, TRANSFER: 0 };

    paymentsGrouped.forEach((group) => {
      const amount = Number(group._sum.amount || 0);
      const tips = Number(group._sum.tipAmount || 0);
      if (group.paymentMethod in breakdown) {
        breakdown[group.paymentMethod as keyof typeof breakdown] = amount;
      }
      totalIncome += amount;
      totalTips += tips;
    });

    const tipsDetail = (paymentsWithTips || []).map(payment => ({
      id: payment.id,
      table: payment.order?.table ? `Mesa ${payment.order.table.number}` : 'Mostrador / Para llevar',
      amount: Number(payment.tipAmount || 0),
      method: payment.paymentMethod,
    }));

    const openingCash = activeShift ? Number(activeShift.openingAmount || 0) : 0;
    
    const totalExpenses = activeShift?.expenses?.reduce(
      (sum, exp) => sum + Number(exp.amount || 0), 0
    ) || 0;

    const expectedCashInDrawer = openingCash + breakdown.CASH - totalExpenses;

    const ordersDetail = (closedOrders || []).map(order => {
      const methods = (order.payments || []).map(p => p.paymentMethod);
      const totalTip = (order.payments || []).reduce((sum, p) => sum + Number(p.tipAmount || 0), 0);

      return {
        id: order.id,
        table: order.table ? `Mesa ${order.table.number}` : 'Mostrador / Llevar',
        amount: Number(order.totalAmount || 0),
        tip: totalTip,
        methods: [...new Set(methods)],
        payments: (order.payments || []).map(p => ({
          id: p.id,
          method: p.paymentMethod,
          amount: Number(p.amount || 0)
        })),
        items: (order.items || []).map(i => ({
          productId: i.product?.id || i.productId || 'desconocido',
          name: i.product?.name || 'Producto',
          quantity: Number(i.quantity || 0)
        }))
      };
    });

    // ==========================================
    // CÁLCULO DE PRODUCTOS MÁS VENDIDOS
    // ==========================================
    const productSales: Record<string, { id: string; name: string; quantity: number }> = {};

    (closedOrders || []).forEach(order => {
      (order.items || []).forEach(item => {
        const productId = item.product?.id || item.productId || 'item';
        const productName = item.product?.name || 'Producto';
        if (!productSales[productId]) {
          productSales[productId] = {
            id: productId,
            name: productName,
            quantity: 0
          };
        }
        productSales[productId].quantity += Number(item.quantity || 0);
      });
    });

    const soldProducts = Object.values(productSales).sort((a, b) => b.quantity - a.quantity);

    return {
      date: startOfDay.toISOString().split('T')[0],
      shiftId: activeShift?.id || null,
      openingCash,
      totalExpenses,
      totalIncome,
      totalTips,       
      tipsDetail,      
      ordersDetail,      
      soldProducts,
      breakdown,
      closedOrdersCount,
      expectedCashInDrawer,
      expenses: activeShift?.expenses || [],
    };
  }

  // ==========================================
  // ACTUALIZAR UN PAGO EXISTENTE
  // ==========================================
  async updatePayment(id: string, data: { amount: number; tipAmount: number; paymentMethod: any }) {
    return this.prisma.payment.update({
      where: { id },
      data: {
        amount: data.amount,
        tipAmount: data.tipAmount,
        paymentMethod: data.paymentMethod
      }
    });
  }

  // ==========================================
  // ELIMINAR UN PAGO
  // ==========================================
  async deletePayment(id: string) {
    return this.prisma.payment.delete({
      where: { id }
    });
  }
}