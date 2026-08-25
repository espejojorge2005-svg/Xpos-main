import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { RegisterDto } from './dto/register.dto';
import { LoginDto, LoginPinDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService
  ) {}

  async register(data: RegisterDto) {
    // 1. Verificamos que el correo no exista
    const userExists = await this.prisma.user.findUnique({ where: { email: data.email } });
    if (userExists) throw new BadRequestException('El correo ya está registrado');

    // 2. Encriptamos la contraseña
    const hashedPassword = await bcrypt.hash(data.password, 10);

    // 3. El primer usuario es SUPER_ADMIN; cualquier nuevo registro genera su propio Restaurante con rol ADMIN
    const userCount = await this.prisma.user.count();
    const isFirstUser = userCount === 0;
    const role = isFirstUser ? 'SUPER_ADMIN' : 'ADMIN';

    let restaurantId: string | null = null;
    if (!isFirstUser) {
      const restaurant = await this.prisma.restaurant.create({
        data: {
          name: `Restaurante de ${data.name}`,
        }
      });
      restaurantId = restaurant.id;
    }

    // 4. Guardamos el usuario con permisos de Administrador
    const user = await this.prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        password: hashedPassword,
        role: role as any,
        restaurantId,
        allowedViews: ['*'],
      }
    });

    // 5. Generamos JWT y retoramos token + usuario
    const allowedViews = ['*'];
    const payload = { sub: user.id, email: user.email, role: user.role, allowedViews, restaurantId: user.restaurantId };
    return {
      access_token: this.jwtService.sign(payload),
      user: { id: user.id, name: user.name, role: user.role, allowedViews, restaurantId: user.restaurantId }
    };
  }

  async login(data: LoginDto) {
    // 1. Buscamos al usuario
    const user = await this.prisma.user.findUnique({ 
      where: { email: data.email },
      include: { restaurant: true } 
    });
    if (!user) throw new UnauthorizedException('Credenciales inválidas');

    // 1.5 Verificar que el usuario esté activo
    if (!user.isActive) throw new UnauthorizedException('Usuario desactivado. Contacte al administrador.');
    
    // 1.6 Verificar que el restaurante esté activo y con suscripción vigente
    if (user.restaurantId && user.restaurant) {
      if (!user.restaurant.isActive) {
        throw new UnauthorizedException('El restaurante se encuentra suspendido. Contacte a soporte.');
      }
      if (new Date() > new Date(user.restaurant.subscriptionEndDate)) {
        throw new UnauthorizedException('Suscripción expirada. Por favor, contacte a soporte para renovar.');
      }
    }

    // 2. Comparamos la contraseña
    const isPasswordValid = await bcrypt.compare(data.password, user.password);
    if (!isPasswordValid) throw new UnauthorizedException('Credenciales inválidas');

    // 3. ADMIN / SUPER_ADMIN o lista vacía obtienen acceso total ['*']
    const allowedViews = (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN' || !user.allowedViews || user.allowedViews.length === 0) 
      ? ['*'] 
      : user.allowedViews;

    // 4. Generamos el JWT con los permisos y el tenant (restaurantId)
    const payload = { sub: user.id, email: user.email, role: user.role, allowedViews, restaurantId: user.restaurantId };
    return {
      access_token: this.jwtService.sign(payload),
      user: { id: user.id, name: user.name, role: user.role, allowedViews, restaurantId: user.restaurantId }
    };
  }

  async loginPin(data: LoginPinDto) {
    // 1. Buscamos al usuario por PIN, ID y restaurante
    const user = await this.prisma.user.findFirst({
      where: { 
        id: data.userId,
        pin: data.pin,
        restaurantId: data.restaurantId
      },
      include: { restaurant: true }
    });

    if (!user) throw new UnauthorizedException('PIN incorrecto o empleado no encontrado');

    // 1.5 Verificar estado
    if (!user.isActive) throw new UnauthorizedException('Usuario desactivado.');
    
    if (user.restaurantId && user.restaurant) {
      if (!user.restaurant.isActive) {
        throw new UnauthorizedException('El restaurante se encuentra suspendido.');
      }
      if (new Date() > new Date(user.restaurant.subscriptionEndDate)) {
        throw new UnauthorizedException('Suscripción expirada.');
      }
    }

    // 2. Generamos JWT
    const allowedViews = (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') ? ['*'] : user.allowedViews;
    const payload = { sub: user.id, email: user.email, role: user.role, allowedViews, restaurantId: user.restaurantId };
    return {
      access_token: this.jwtService.sign(payload),
      user: { id: user.id, name: user.name, role: user.role, allowedViews, restaurantId: user.restaurantId }
    };
  }

  async getStaffByRestaurant(restaurantId: string) {
    return this.prisma.user.findMany({
      where: {
        restaurantId,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        role: true,
      },
      orderBy: {
        name: 'asc'
      }
    });
  }
}