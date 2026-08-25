import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePaymentDto } from './dto/create-payment.dto';

@Injectable()
export class PaymentsService {
  constructor(private prisma: PrismaService) {}

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

        const stockBefore = item.product.stock;
        const stockAfter = stockBefore - item.quantity;

        // 2a. Descontar el stock del producto terminado + Registrar movimiento SALE
        await this.prisma.$transaction([
          this.prisma.product.update({
            where: { id: item.productId },
            data: { stock: { decrement: item.quantity } }
          }),
          this.prisma.stockMovement.create({
            data: {
              productId: item.productId,
              type: 'SALE',
              delta: -item.quantity,
              stockBefore,
              stockAfter,
              reason: `Venta (Orden #${order.id.slice(0, 8)})`
            }
          })
        ]);

        // 2b. Descontar materias primas (ingredientes de receta)
        if (item.product.recipeItems && item.product.recipeItems.length > 0) {
          for (const recipeItem of item.product.recipeItems) {
            await this.prisma.inventoryItem.update({
              where: { id: recipeItem.inventoryItemId },
              data: { stockQuantity: { decrement: item.quantity * Number(recipeItem.quantityRequired) } }
            });
          }
        }
      }
    }

    return newPayment;
  }

  async getDailyClosure(dateString?: string) {
    const targetDate = dateString ? new Date(dateString) : new Date();
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

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
        where: { createdAt: { gte: startOfDay, lte: endOfDay } },
        _sum: { amount: true, tipAmount: true },
      }),
      // 2. Conteo de órdenes cerradas
      this.prisma.order.count({
        where: { status: 'CLOSED', updatedAt: { gte: startOfDay, lte: endOfDay } },
      }),
      // 3. Detalle de Propinas
      this.prisma.payment.findMany({
        where: {
          createdAt: { gte: startOfDay, lte: endOfDay },
          tipAmount: { gt: 0 }, 
        },
        include: {
          order: {
            include: { table: true },
          },
        },
        orderBy: { createdAt: 'desc' }
      }),
      // 4. Fondo de caja y gastos activos
      this.prisma.cashShift.findFirst({
        where: { 
          status: 'OPEN',
          openedAt: { gte: startOfDay, lte: endOfDay }
        },
        include: { expenses: true }
      }),
      // 5. Detalle de todas las órdenes cerradas
      this.prisma.order.findMany({
        where: {
          status: 'CLOSED',
          updatedAt: { gte: startOfDay, lte: endOfDay }
        },
        include: {
          table: true,
          payments: true,
          items: { include: { product: true } }
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
      breakdown[group.paymentMethod as keyof typeof breakdown] = amount;
      totalIncome += amount;
      totalTips += tips;
    });

    const tipsDetail = paymentsWithTips.map(payment => ({
      id: payment.id,
      table: payment.order?.table ? `Mesa ${payment.order.table.number}` : 'Mostrador / Para llevar',
      amount: Number(payment.tipAmount),
      method: payment.paymentMethod,
    }));

    const openingCash = activeShift ? Number(activeShift.openingAmount) : 0;
    
    const totalExpenses = activeShift?.expenses.reduce(
      (sum, exp) => sum + Number(exp.amount), 0
    ) || 0;

    const expectedCashInDrawer = openingCash + breakdown.CASH - totalExpenses;

    const ordersDetail = closedOrders.map(order => {
      const methods = order.payments.map(p => p.paymentMethod);
      const totalTip = order.payments.reduce((sum, p) => sum + Number(p.tipAmount || 0), 0);

      return {
        id: order.id,
        table: order.table ? `Mesa ${order.table.number}` : 'Mostrador / Llevar',
        amount: Number(order.totalAmount),
        tip: totalTip,
        methods: [...new Set(methods)],
        payments: order.payments.map(p => ({
          id: p.id,
          method: p.paymentMethod,
          amount: Number(p.amount)
        })),
        items: order.items.map(i => ({
          productId: i.product?.id || 'desconocido',
          name: i.product?.name || 'Producto eliminado',
          quantity: Number(i.quantity)
        }))
      };
    });

    // ==========================================
    // CÁLCULO DE PRODUCTOS MÁS VENDIDOS
    // (Utilizando closedOrders en lugar de volver a consultar a la DB)
    // ==========================================
    const productSales: Record<string, { id: string; name: string; quantity: number }> = {};

    closedOrders.forEach(order => {
      order.items.forEach(item => {
        if (item.product) {
          const productId = item.product.id;
          if (!productSales[productId]) {
            productSales[productId] = {
              id: productId,
              name: item.product.name,
              quantity: 0
            };
          }
          productSales[productId].quantity += Number(item.quantity);
        }
      });
    });

    const soldProducts = Object.values(productSales).sort((a, b) => b.quantity - a.quantity);

    // ==========================================
    // GESTIÓN DEL FONDO DE CAJA Y GASTOS
    // ==========================================
    // ... (el resto de tu código de activeShift, expenses, etc.)

    // En el return final, asegúrate de devolver soldProducts:
    return {
      date: startOfDay.toISOString().split('T')[0],
      shiftId: activeShift?.id || null,
      openingCash,
      totalExpenses,
      totalIncome,
      totalTips,       
      tipsDetail,      
      ordersDetail,      
      soldProducts,    // <-- AÑADE ESTA LÍNEA AQUÍ
      breakdown,
      closedOrdersCount,
      expectedCashInDrawer,
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