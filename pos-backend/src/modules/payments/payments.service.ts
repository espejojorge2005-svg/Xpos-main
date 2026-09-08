import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
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

  async processPayment(data: CreatePaymentDto, reqUser?: any, restaurantIdParam?: string | null) {
    const restaurantId = await this.resolveRestaurantId(reqUser, restaurantIdParam);

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

    // Validación multi-tenant: La comanda debe pertenecer al restaurante del usuario
    if (restaurantId && order.restaurantId && order.restaurantId !== restaurantId) {
      throw new ForbiddenException('No tienes permiso para procesar pagos de otro restaurante');
    }

    // Transacción ACID completa: creación de pago, cierre de orden y descuento de insumos
    return await this.prisma.$transaction(async (tx) => {
      const newPayment = await tx.payment.create({
        data: {
          orderId: data.orderId,
          amount: data.amount,
          tipAmount: data.tipAmount ?? 0,
          paymentMethod: data.paymentMethod,
        },
      });

      // Marcar items como pagados si vienen en el request (Cuentas separadas)
      if (data.itemIds && data.itemIds.length > 0) {
        await tx.orderItem.updateMany({
          where: { id: { in: data.itemIds } },
          data: { isPaid: true }
        });
      }

      const previousPaid = order.payments.reduce((sum, p) => sum + Number(p.amount), 0);
      const totalPaid = Math.round((previousPaid + Number(data.amount) + Number.EPSILON) * 100) / 100;
      const expectedTotal = Math.round((Number(order.totalAmount) + Number.EPSILON) * 100) / 100;
      const isOrderFullyPaid = totalPaid >= expectedTotal - 0.005;

      // ==========================================
      // MOTOR DE INVENTARIO: Descuenta materias primas (Recetas)
      // Para cuentas separadas, descuenta los ítems cobrados en este pago.
      // Si la cuenta se cierra completamente, descuenta todos los ítems restantes no pagados previamente.
      // ==========================================
      const itemsToDeduct = (data.itemIds && data.itemIds.length > 0)
        ? order.items.filter(it => data.itemIds!.includes(it.id))
        : (isOrderFullyPaid ? order.items.filter(it => !it.isPaid) : []);

      for (const item of itemsToDeduct) {
        if (!item.product) continue;
        for (const recipeItem of item.product.recipeItems) {
          const totalDeduction = Number(recipeItem.quantityRequired) * item.quantity;
          await tx.inventoryItem.update({
            where: { id: recipeItem.inventoryItemId },
            data: { stockQuantity: { decrement: totalDeduction } },
          });
        }
      }

      if (isOrderFullyPaid) {
        // Cerramos la orden y liberamos la mesa
        await tx.order.update({ where: { id: order.id }, data: { status: 'CLOSED' } });
        if (order.tableId) {
          await tx.table.update({ where: { id: order.tableId }, data: { status: 'FREE' } });
        }
      }

      return newPayment;
    });
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
    const restaurantId = await this.resolveRestaurantId(reqUser, restaurantIdParam);

    // El turno activo de la caja (cualquiera que esté actualmente OPEN para este restaurante)
    const shiftWhere: any = { status: 'OPEN' };
    if (restaurantId) {
      shiftWhere.restaurantId = restaurantId;
    }

    const activeShift = await this.prisma.cashShift.findFirst({
      where: shiftWhere,
      include: { expenses: true },
      orderBy: { openedAt: 'desc' },
    });

    let paymentWhere: any = {};
    let orderWhere: any = {};
    let closureDate = new Date();

    if (!dateString && activeShift) {
      // Turno activo: el rango es continuo desde que se abrió el turno (openedAt)
      // Esto previene que al pasar de medianoche se pierdan las ventas y propinas del turno
      closureDate = activeShift.openedAt;
      paymentWhere = {
        createdAt: { gte: activeShift.openedAt },
      };
      if (restaurantId) {
        paymentWhere.order = { restaurantId };
      }
      orderWhere = {
        status: 'CLOSED',
        OR: [
          { updatedAt: { gte: activeShift.openedAt } },
          { payments: { some: { createdAt: { gte: activeShift.openedAt } } } },
        ],
      };
      if (restaurantId) {
        orderWhere.restaurantId = restaurantId;
      }
    } else {
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
      closureDate = startOfDay;

      paymentWhere = { createdAt: { gte: startOfDay, lte: endOfDay } };
      if (restaurantId) {
        paymentWhere.order = { restaurantId };
      }
      orderWhere = { status: 'CLOSED', updatedAt: { gte: startOfDay, lte: endOfDay } };
      if (restaurantId) {
        orderWhere.restaurantId = restaurantId;
      }
    }

    // ==========================================
    // EJECUCIÓN CONCURRENTE (Optimización de Velocidad)
    // ==========================================
    const [
      paymentsGrouped,
      closedOrdersCount,
      paymentsWithTips,
      closedOrders,
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
      // 4. Detalle de todas las órdenes cerradas (select optimizado sin sobrecarga de joins)
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
      date: closureDate.toISOString().split('T')[0],
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