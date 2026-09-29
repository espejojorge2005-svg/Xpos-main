/**
 * Script de inicialización y simulación de producción para "Miel breakfast"
 * - Crea el restaurante con todas sus zonas y mesas.
 * - Registra las estaciones de cocina y barra.
 * - Inserta la carta completa con sus categorías y productos extraídos de las imágenes.
 * - Crea el personal solicitado (nombres reales, correos nombre@mielbreakfast.com, contraseñas y PINs).
 * - Ejecuta ventas y cierres de caja a lo largo de una semana completa (7 días).
 */

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

// Colores de consola
const GREEN = '\x1b[32m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

const USERS_TO_CREATE = [
  {
    name: 'Valeria Ramos',
    email: 'valeria@mielbreakfast.com',
    role: 'ADMIN',
    passwordRaw: 'MielAdmin2026!',
    pin: '1234',
    allowedViews: ['ALL']
  },
  {
    name: 'Mateo Salazar',
    email: 'mateo@mielbreakfast.com',
    role: 'WAITER',
    passwordRaw: 'MielWaiter2026!',
    pin: '1024',
    allowedViews: ['POS', 'TABLES']
  },
  {
    name: 'Sofía Paredes',
    email: 'sofia@mielbreakfast.com',
    role: 'WAITER',
    passwordRaw: 'MielWaiter2026!',
    pin: '2048',
    allowedViews: ['POS', 'TABLES']
  },
  {
    name: 'Lucas Herrera',
    email: 'lucas@mielbreakfast.com',
    role: 'COOK',
    passwordRaw: 'MielCook2026!',
    pin: '3012',
    allowedViews: ['KITCHEN']
  },
  {
    name: 'Camila Castro',
    email: 'camila@mielbreakfast.com',
    role: 'COOK',
    passwordRaw: 'MielCook2026!',
    pin: '4023',
    allowedViews: ['KITCHEN']
  },
  {
    name: 'Diego Morales',
    email: 'diego@mielbreakfast.com',
    role: 'CASHIER',
    passwordRaw: 'MielCashier2026!',
    pin: '5034',
    allowedViews: ['POS', 'CASH_REGISTER', 'REPORTS']
  }
];

const MENU_CATEGORIES = [
  {
    name: 'Desayunos Dulces',
    products: [
      {
        name: 'Buttermilk',
        price: 21.00,
        description: 'Tres panqueques estilo americano, coronados con miel de maple y mantequilla artesanal.',
        station: 'Pastelería y Dulces',
        stock: 100
      },
      {
        name: 'Apple Pie',
        price: 27.00,
        description: 'Tres panqueques estilo americano, coronados con nuestro relleno de pie de manzana casero y mantequilla artesanal.',
        station: 'Pastelería y Dulces',
        stock: 80
      },
      {
        name: 'Banana Toffee',
        price: 25.00,
        description: 'Tres panqueques estilo americano, coronados con nuestra miel casera de plátano flameado y mantequilla artesanal.',
        station: 'Pastelería y Dulces',
        stock: 80
      },
      {
        name: 'Blueberry',
        price: 29.00,
        description: 'Tres panqueques estilo americano, coronados con nuestra miel casera de arándanos y mantequilla artesanal.',
        station: 'Pastelería y Dulces',
        stock: 80
      },
      {
        name: 'Peach Flambé',
        price: 31.00,
        description: 'Tres panqueques estilo americano, coronados con nuestra miel casera de durazno, una bola de helado de vainilla y pecanas.',
        station: 'Pastelería y Dulces',
        stock: 80
      }
    ]
  },
  {
    name: 'Tostadas y Bowls',
    products: [
      {
        name: 'Tostones de Fruta',
        price: 41.00,
        description: 'Tres tostones de pan artesanal de masa madre, cubiertos con: Crema de avellanas, fresa y crema batida / Yogurt griego, naranja, pistachos y miel de abeja / Crema de maní, plátano, chocolate rallado y miel de maple.',
        station: 'Pastelería y Dulces',
        stock: 60
      },
      {
        name: 'Tostadas Francesas',
        price: 31.00,
        description: 'Dos tostadas de pan brioche artesanal, coronadas con dos frutas de elección, una bola de mantequilla artesanal y miel de maple.',
        station: 'Cocina Caliente',
        stock: 75
      },
      {
        name: 'Tostada Francesa ESA',
        price: 35.00,
        description: 'Tostada contundente de pan brioche artesanal, coronada con nuestro relleno de apple pie, crema batida y pecanas caramelizadas.',
        station: 'Cocina Caliente',
        stock: 70
      },
      {
        name: 'Frozen Bowl',
        price: 25.00,
        description: 'Cama de helado artesanal de frutas, coronado con fresas, plátano, arándanos, granola, miel de abeja y coco rallado.',
        station: 'Barra de Bebidas',
        stock: 60
      }
    ]
  },
  {
    name: 'Desayunos Salados',
    products: [
      {
        name: 'Sartén Huachana',
        price: 39.00,
        description: 'Cebolla blanca, salchicha huachana artesanal y huevos con queso fundido. Servido en una sartén personal, acompañada de tostadas de masa madre.',
        station: 'Cocina Caliente',
        stock: 90
      },
      {
        name: 'Huevos Napolitanos',
        price: 37.00,
        description: 'Cebolla caramelizada, tomates y vino tinto forman una cama para dos huevos escalfados, queso mozzarella y albahaca. Servido en sartén personal y acompañado de tostadas de masa madre.',
        station: 'Cocina Caliente',
        stock: 80
      },
      {
        name: 'Combo Panzote',
        price: 37.00,
        description: 'Pan artesanal de masa madre, una bola de mantequilla, dos huevos fritos, dos lonjas de tocino, jugo y café americano.',
        station: 'Cocina Caliente',
        stock: 120
      },
      {
        name: 'Croque Madame',
        price: 37.00,
        description: 'Sándwich francés contundente hecho con nuestro pan de masa madre, jamón, mostaza, queso mozzarella y crema bechamel. Gratinado en el horno y coronado con un huevo a la inglesa.',
        station: 'Cocina Caliente',
        stock: 85
      },
      {
        name: 'Breakfast Burrito',
        price: 41.00,
        description: 'Lomo fino, huevos revueltos con queso cheddar, palta fuerte, ajonjolí y salsa napolitana, todo envuelto en tortilla de trigo.',
        station: 'Cocina Caliente',
        stock: 70
      }
    ]
  },
  {
    name: 'Tostones y Especialidades',
    products: [
      {
        name: 'Especialidad de la Casa',
        price: 35.00,
        description: 'Pregunta por la creación del chef recomendada para la semana.',
        station: 'Cocina Caliente',
        stock: 50
      },
      {
        name: 'Avocado Toast',
        price: 29.00,
        description: 'Dos tostones artesanales de masa madre, cubiertos con palta y dos huevos fritos.',
        station: 'Cocina Caliente',
        stock: 100
      },
      {
        name: 'Caprese',
        price: 29.00,
        description: 'Dos tostones artesanales de masa madre, cubiertos con pesto, queso mozzarella, tomate y albahaca.',
        station: 'Cocina Caliente',
        stock: 70
      },
      {
        name: 'Grilled Cheese de Mamá',
        price: 29.00,
        description: 'Sándwich contundente, relleno de dos tipos de queso y blindado en mantequilla artesanal.',
        station: 'Cocina Caliente',
        stock: 80
      },
      {
        name: 'Omelette Clásico (2 ing.)',
        price: 23.00,
        description: 'Elige 2 ingredientes: Queso, Tocino, Albahaca o Tomate.',
        station: 'Cocina Caliente',
        stock: 90
      },
      {
        name: 'Omelette Mixto (3 ing.)',
        price: 25.00,
        description: 'Elige 3 ingredientes: Queso, Tocino, Albahaca o Tomate.',
        station: 'Cocina Caliente',
        stock: 90
      },
      {
        name: 'Omelette Especial (4 ing.)',
        price: 27.00,
        description: 'Elige tus ingredientes completos: Queso, Tocino, Albahaca y Tomate.',
        station: 'Cocina Caliente',
        stock: 90
      }
    ]
  },
  {
    name: 'Bebidas',
    products: [
      {
        name: 'Amanecer',
        price: 11.00,
        description: 'Jugo natural de naranja y zanahoria.',
        station: 'Barra de Bebidas',
        stock: 150
      },
      {
        name: 'Berry Blast',
        price: 11.00,
        description: 'Jugo refrescante de arándanos y fresas.',
        station: 'Barra de Bebidas',
        stock: 150
      },
      {
        name: 'Clásicos',
        price: 10.00,
        description: 'Jugo de frutas a elección: Naranja, Papaya o Piña.',
        station: 'Barra de Bebidas',
        stock: 200
      },
      {
        name: 'Manzaniña',
        price: 11.00,
        description: 'Jugo suave y digestivo de manzana y piña.',
        station: 'Barra de Bebidas',
        stock: 150
      },
      {
        name: 'Surtido',
        price: 11.00,
        description: 'Jugo tradicional de frutas selectas de estación.',
        station: 'Barra de Bebidas',
        stock: 150
      },
      {
        name: 'Naranja',
        price: 11.00,
        description: 'Jugo de naranja 100% natural recién exprimido.',
        station: 'Barra de Bebidas',
        stock: 200
      },
      {
        name: 'Orange Brew',
        price: 15.00,
        description: 'Jugo de naranja natural con un shot de café espresso sobre hielo.',
        station: 'Barra de Bebidas',
        stock: 100
      }
    ]
  },
  {
    name: 'Adicionales',
    products: [
      { name: 'Leche adicional', price: 3.00, description: 'Porción de leche entera, descremada o vegetal', station: 'Barra de Bebidas', stock: 100 },
      { name: 'Bola de helado', price: 7.00, description: 'Bola de helado artesanal de vainilla', station: 'Pastelería y Dulces', stock: 100 },
      { name: 'Porción de fruta', price: 5.00, description: 'Porción de fresas, plátano o arándanos frescos', station: 'Pastelería y Dulces', stock: 100 },
      { name: 'Miel de Frutas', price: 7.00, description: 'Miel casera reducida de frutas naturales', station: 'Pastelería y Dulces', stock: 100 },
      { name: 'Granola artesanal', price: 5.00, description: 'Granola horneada con frutos secos y miel', station: 'Pastelería y Dulces', stock: 100 },
      { name: 'Yogurt Griego', price: 5.00, description: 'Porción de yogurt griego natural sin azúcar', station: 'Pastelería y Dulces', stock: 100 },
      { name: 'Tocino crocante', price: 7.00, description: 'Dos lonjas de tocino artesanal crocante', station: 'Cocina Caliente', stock: 100 },
      { name: 'Porción de huevos (2)', price: 6.00, description: 'Dos huevos fritos o revueltos al gusto', station: 'Cocina Caliente', stock: 100 },
      { name: 'Porción de Pan Masa Madre', price: 6.00, description: 'Dos rebanadas de pan artesanal de masa madre tostado', station: 'Cocina Caliente', stock: 100 }
    ]
  }
];

async function main() {
  console.log(`\n${CYAN}${BOLD}======================================================================${RESET}`);
  console.log(`${CYAN}${BOLD}   INICIALIZACIÓN DE 'Miel breakfast' Y SIMULACIÓN DE 1 SEMANA       ${RESET}`);
  console.log(`${CYAN}${BOLD}======================================================================${RESET}\n`);

  // 1. Obtener o crear Plan
  let plan = await prisma.subscriptionPlan.findFirst({
    where: { code: 'PREMIUM' }
  });
  if (!plan) {
    plan = await prisma.subscriptionPlan.findFirst({
      where: { code: 'PRO' }
    });
  }
  if (!plan) {
    plan = await prisma.subscriptionPlan.findFirst();
  }
  if (!plan) {
    plan = await prisma.subscriptionPlan.create({
      data: {
        name: 'Plan Empresarial Pro',
        code: 'PRO',
        price: 99.00,
        maxUsers: 15,
        features: ['POS', 'KITCHEN', 'REPORTS', 'INVENTORY', 'MULTI_DEVICE']
      }
    });
  }
  console.log(`${GREEN}✓ Plan SaaS asignado: ${plan.name} (Max usuarios: ${plan.maxUsers})${RESET}`);

  // 2. Crear o resetear Restaurante "Miel breakfast"
  let restaurant = await prisma.restaurant.findFirst({
    where: {
      OR: [
        { name: 'Miel breakfast' },
        { slug: 'miel-breakfast' }
      ]
    }
  });

  if (restaurant) {
    console.log(`${YELLOW}⚠ Restaurante '${restaurant.name}' ya existía. Actualizando datos...${RESET}`);
    restaurant = await prisma.restaurant.update({
      where: { id: restaurant.id },
      data: {
        name: 'Miel breakfast',
        slug: 'miel-breakfast',
        slogan: 'Desayunos, Panqueques y Cafetería Artesanal',
        address: 'Av. Primavera 450, Miraflores, Lima',
        phone: '01-4458920',
        ownerName: 'Valeria Ramos',
        ownerPhone: '987123456',
        planId: plan.id,
        isActive: true
      }
    });
  } else {
    restaurant = await prisma.restaurant.create({
      data: {
        name: 'Miel breakfast',
        slug: 'miel-breakfast',
        slogan: 'Desayunos, Panqueques y Cafetería Artesanal',
        address: 'Av. Primavera 450, Miraflores, Lima',
        phone: '01-4458920',
        ownerName: 'Valeria Ramos',
        ownerPhone: '987123456',
        planId: plan.id,
        isActive: true
      }
    });
    console.log(`${GREEN}✓ Creado restaurante 'Miel breakfast' (ID: ${restaurant.id})${RESET}`);
  }

  // 3. Crear Zonas y Mesas
  console.log(`\nConfigurando Zonas y Mesas...`);
  let salon = await prisma.zone.findFirst({
    where: { restaurantId: restaurant.id, name: 'Salón Principal' }
  });
  if (!salon) {
    salon = await prisma.zone.create({
      data: {
        restaurantId: restaurant.id,
        name: 'Salón Principal',
        isActive: true
      }
    });
  }

  let terraza = await prisma.zone.findFirst({
    where: { restaurantId: restaurant.id, name: 'Terraza' }
  });
  if (!terraza) {
    terraza = await prisma.zone.create({
      data: {
        restaurantId: restaurant.id,
        name: 'Terraza',
        isActive: true
      }
    });
  }

  const salonTables = [
    { number: 'M1', capacity: 4, posX: 50, posY: 50 },
    { number: 'M2', capacity: 4, posX: 150, posY: 50 },
    { number: 'M3', capacity: 6, posX: 250, posY: 50 },
    { number: 'M4', capacity: 2, posX: 50, posY: 150 },
    { number: 'M5', capacity: 4, posX: 150, posY: 150 }
  ];

  const terrazaTables = [
    { number: 'T1', capacity: 2, posX: 50, posY: 50 },
    { number: 'T2', capacity: 4, posX: 150, posY: 50 },
    { number: 'T3', capacity: 4, posX: 250, posY: 50 }
  ];

  const createdTables = [];

  for (const t of salonTables) {
    let table = await prisma.table.findFirst({
      where: { zoneId: salon.id, number: t.number }
    });
    if (!table) {
      table = await prisma.table.create({
        data: {
          zoneId: salon.id,
          number: t.number,
          capacity: t.capacity,
          posX: t.posX,
          posY: t.posY,
          status: 'FREE'
        }
      });
    }
    createdTables.push(table);
  }

  for (const t of terrazaTables) {
    let table = await prisma.table.findFirst({
      where: { zoneId: terraza.id, number: t.number }
    });
    if (!table) {
      table = await prisma.table.create({
        data: {
          zoneId: terraza.id,
          number: t.number,
          capacity: t.capacity,
          posX: t.posX,
          posY: t.posY,
          status: 'FREE'
        }
      });
    }
    createdTables.push(table);
  }
  console.log(`${GREEN}✓ Zonas y ${createdTables.length} mesas registradas correctamente.${RESET}`);

  // 4. Crear Estaciones de Cocina
  console.log(`\nConfigurando Estaciones de Producción...`);
  const stationDefs = [
    { name: 'Pastelería y Dulces', colorHex: '#ec4899' },
    { name: 'Cocina Caliente', colorHex: '#f97316' },
    { name: 'Barra de Bebidas', colorHex: '#06b6d4' }
  ];

  const stationMap = {};
  for (const st of stationDefs) {
    let station = await prisma.kitchenStation.findFirst({
      where: { restaurantId: restaurant.id, name: st.name }
    });
    if (!station) {
      station = await prisma.kitchenStation.create({
        data: {
          restaurantId: restaurant.id,
          name: st.name,
          colorHex: st.colorHex
        }
      });
    }
    stationMap[st.name] = station;
  }
  console.log(`${GREEN}✓ Estaciones de cocina listas: ${Object.keys(stationMap).join(', ')}${RESET}`);

  // 5. Crear Categorías y Productos de la Carta
  console.log(`\nRegistrando Carta y Productos según fotografías...`);
  const allCreatedProducts = [];

  for (const catDef of MENU_CATEGORIES) {
    let category = await prisma.category.findFirst({
      where: { restaurantId: restaurant.id, name: catDef.name }
    });
    if (!category) {
      category = await prisma.category.create({
        data: {
          restaurantId: restaurant.id,
          name: catDef.name
        }
      });
    }

    for (const prodDef of catDef.products) {
      let product = await prisma.product.findFirst({
        where: { restaurantId: restaurant.id, name: prodDef.name }
      });

      const station = stationMap[prodDef.station];

      if (!product) {
        product = await prisma.product.create({
          data: {
            restaurantId: restaurant.id,
            name: prodDef.name,
            price: prodDef.price,
            stock: prodDef.stock,
            minStock: 10,
            categoryId: category.id,
            isActive: true,
            stations: station ? { connect: [{ id: station.id }] } : undefined
          }
        });
      } else {
        product = await prisma.product.update({
          where: { id: product.id },
          data: {
            price: prodDef.price,
            stock: prodDef.stock,
            categoryId: category.id,
            isActive: true
          }
        });
      }
      allCreatedProducts.push({ ...product, categoryName: catDef.name });
    }
  }
  console.log(`${GREEN}✓ ${allCreatedProducts.length} productos insertados en la carta de 'Miel breakfast'.${RESET}`);

  // 6. Crear Usuarios (Personal con nombres de personas reales)
  console.log(`\nCreando Cuentas de Personal para Miel breakfast...`);
  const createdUsers = [];

  for (const u of USERS_TO_CREATE) {
    const hashedPassword = await bcrypt.hash(u.passwordRaw, 10);
    let user = await prisma.user.findUnique({
      where: { email: u.email }
    });

    if (user) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          name: u.name,
          role: u.role,
          password: hashedPassword,
          pin: u.pin,
          restaurantId: restaurant.id,
          isActive: true,
          allowedViews: u.allowedViews
        }
      });
      console.log(`  ${YELLOW}↻ Usuario actualizado:${RESET} ${u.name} (${u.role}) -> ${u.email}`);
    } else {
      user = await prisma.user.create({
        data: {
          name: u.name,
          email: u.email,
          role: u.role,
          password: hashedPassword,
          pin: u.pin,
          restaurantId: restaurant.id,
          isActive: true,
          allowedViews: u.allowedViews
        }
      });
      console.log(`  ${GREEN}✓ Usuario creado:${RESET} ${u.name} (${u.role}) -> ${u.email}`);
    }
    createdUsers.push({ ...user, rawPassword: u.passwordRaw, rawPin: u.pin });
  }

  // 7. Simular 1 semana de Ventas y Cierres de Caja (7 días)
  console.log(`\n${CYAN}${BOLD}Ejecutando ventas y cierres de caja por 7 días continuos...${RESET}`);

  // Guardamos usuario cajero y administrador para asignaciones
  const cashierUser = createdUsers.find(u => u.role === 'CASHIER') || createdUsers[0];
  const waiterUser = createdUsers.find(u => u.role === 'WAITER') || createdUsers[0];

  const now = new Date();
  const summaryDays = [];

  // Recorremos desde hace 7 días hasta hoy (d = 7, 6, 5, 4, 3, 2, 1)
  for (let daysAgo = 7; daysAgo >= 1; daysAgo--) {
    const targetDate = new Date(now);
    targetDate.setDate(targetDate.getDate() - daysAgo);

    const year = targetDate.getFullYear();
    const month = String(targetDate.getMonth() + 1).padStart(2, '0');
    const day = String(targetDate.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

    // Horas de turno: 08:00 AM apertura, 16:30 PM cierre
    const openedAt = new Date(`${dateStr}T08:00:00.000Z`);
    const closedAt = new Date(`${dateStr}T16:30:00.000Z`);

    const openingCash = 150.00;

    // Crear Shift
    const shift = await prisma.cashShift.create({
      data: {
        restaurantId: restaurant.id,
        userId: cashierUser.id,
        openingAmount: openingCash,
        status: 'CLOSED',
        openedAt: openedAt,
        closedAt: closedAt
      }
    });

    // Gastos chicos del día (egresos de caja menor)
    const expenseSamples = [
      { amount: 35.00, desc: 'Compra matutina de fresas, arándanos y frutas frescas' },
      { amount: 20.00, desc: 'Reposición de hielo en cubos y empaques compostables' },
      { amount: 18.00, desc: 'Compra de leche fresca y mantequilla artesanal de emergencia' }
    ];
    const dayExpenses = [expenseSamples[daysAgo % expenseSamples.length]];
    for (const exp of dayExpenses) {
      await prisma.cashExpense.create({
        data: {
          shiftId: shift.id,
          amount: exp.amount,
          description: exp.desc,
          createdAt: new Date(`${dateStr}T11:30:00.000Z`)
        }
      });
    }

    // Generar entre 6 y 10 órdenes completas para ese día
    const ordersCount = 7 + (daysAgo % 3);
    let dayTotalVentas = 0;
    let dayTotalEfectivo = 0;
    let dayTotalTarjeta = 0;
    let dayTotalTransferencia = 0;

    const customerNames = [
      'Familia Torres', 'Andrea Medina', 'Carlos Ruiz', 'Sofía & Amigas',
      'Desayuno Corporativo', 'Gonzalo Vidal', 'Micaela Paredes', 'Estudio Jurídico',
      'Luciana Castro', 'Mesa 4 Brunch'
    ];

    for (let oIdx = 0; oIdx < ordersCount; oIdx++) {
      // Hora distribuida entre 08:30 y 16:00
      const orderHour = 8 + Math.floor((oIdx * 7) / ordersCount);
      const orderMin = (oIdx * 17) % 60;
      const orderDate = new Date(`${dateStr}T${String(orderHour).padStart(2, '0')}:${String(orderMin).padStart(2, '0')}:00.000Z`);

      const table = createdTables[oIdx % createdTables.length];

      // Seleccionar 2 a 4 productos del menú
      const itemsInOrder = [];
      const prodA = allCreatedProducts[(oIdx * 3) % allCreatedProducts.length];
      const prodB = allCreatedProducts[(oIdx * 3 + 1) % allCreatedProducts.length];
      const prodDrink = allCreatedProducts.filter(p => p.categoryName === 'Bebidas')[(oIdx) % 7];

      itemsInOrder.push({ product: prodA, qty: 1 + (oIdx % 2) });
      itemsInOrder.push({ product: prodDrink, qty: 1 + (oIdx % 2) });
      if (oIdx % 2 === 0) {
        itemsInOrder.push({ product: prodB, qty: 1 });
      }

      let orderTotal = 0;
      const orderItemsData = itemsInOrder.map(item => {
        const subtotal = item.product.price * item.qty;
        orderTotal += subtotal;
        return {
          productId: item.product.id,
          quantity: item.qty,
          unitPrice: item.product.price,
          subtotal: subtotal,
          status: 'ACTIVE',
          isPaid: true,
          notes: 'Servir en mesa',
          createdAt: orderDate
        };
      });

      // Crear Orden
      const order = await prisma.order.create({
        data: {
          restaurantId: restaurant.id,
          tableId: table.id,
          customerName: customerNames[oIdx % customerNames.length],
          status: 'CLOSED',
          syncStatus: 'SYNCED',
          totalAmount: orderTotal,
          createdAt: orderDate,
          updatedAt: new Date(orderDate.getTime() + 45 * 60 * 1000), // 45 min después
          items: {
            create: orderItemsData
          }
        }
      });

      // Métodos de pago alternados: CASH (45%), CARD (40%), TRANSFER (15%)
      let method = 'CASH';
      if (oIdx % 3 === 1) method = 'CARD';
      if (oIdx % 5 === 0) method = 'TRANSFER';

      const tip = (oIdx % 2 === 0) ? (oIdx % 4 + 2) : 0; // Propina de 2 a 5 soles

      await prisma.payment.create({
        data: {
          orderId: order.id,
          amount: orderTotal,
          tipAmount: tip,
          paymentMethod: method,
          createdAt: new Date(orderDate.getTime() + 40 * 60 * 1000)
        }
      });

      dayTotalVentas += orderTotal;
      if (method === 'CASH') dayTotalEfectivo += orderTotal;
      else if (method === 'CARD') dayTotalTarjeta += orderTotal;
      else if (method === 'TRANSFER') dayTotalTransferencia += orderTotal;

      // Registrar movimiento de kardex/stock para cada producto vendido
      for (const item of itemsInOrder) {
        const prod = item.product;
        await prisma.stockMovement.create({
          data: {
            productId: prod.id,
            type: 'SALE',
            delta: -item.qty,
            stockBefore: prod.stock,
            stockAfter: Math.max(0, prod.stock - item.qty),
            reason: `Venta Orden #${order.id.slice(0, 8)} (${dateStr})`,
            createdAt: orderDate
          }
        });
      }
    }

    summaryDays.push({
      fecha: dateStr,
      ordenes: ordersCount,
      totalVentas: dayTotalVentas.toFixed(2),
      efectivo: dayTotalEfectivo.toFixed(2),
      tarjeta: dayTotalTarjeta.toFixed(2),
      transferencia: dayTotalTransferencia.toFixed(2),
      cajaInicial: openingCash.toFixed(2),
      cajaCierre: (openingCash + dayTotalEfectivo - dayExpenses[0].amount).toFixed(2),
      estadoCaja: 'CERRADA'
    });

    console.log(`  ${GREEN}✓ [${dateStr}]${RESET} Turno cerrado: ${ordersCount} ventas | Total: S/ ${dayTotalVentas.toFixed(2)} (Efectivo: S/ ${dayTotalEfectivo.toFixed(2)}, Tarjetas: S/ ${dayTotalTarjeta.toFixed(2)})`);
  }

  console.log(`\n${CYAN}${BOLD}======================================================================${RESET}`);
  console.log(`${CYAN}${BOLD}                 RESUMEN DE CUENTAS CREADAS                          ${RESET}`);
  console.log(`${CYAN}${BOLD}======================================================================${RESET}`);
  console.table(createdUsers.map(u => ({
    Nombre: u.name,
    Rol: u.role,
    Correo: u.email,
    Password: u.rawPassword,
    PIN: u.rawPin
  })));

  console.log(`\n${CYAN}${BOLD}======================================================================${RESET}`);
  console.log(`${CYAN}${BOLD}              RESUMEN DE LA SEMANA DE VENTAS Y CAJAS                 ${RESET}`);
  console.log(`${CYAN}${BOLD}======================================================================${RESET}`);
  console.table(summaryDays);

  console.log(`\n${GREEN}${BOLD}¡Todo el flujo de producción completado con éxito en la Base de Datos!${RESET}\n`);
}

main()
  .catch(err => {
    console.error(`\n${RED}${BOLD}[ERROR FATAL]${RESET}`, err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
