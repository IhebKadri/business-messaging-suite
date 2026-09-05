import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantsService } from '../tenants/tenants.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { JwtPayload } from './jwt-payload.interface';

type Identity = Pick<JwtPayload, 'sub' | 'tenantId' | 'role'>;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenants: TenantsService,
    private readonly jwt: JwtService,
  ) {}

  async signup(dto: SignupDto) {
    const passwordHash = await argon2.hash(dto.password);

    const tenant = await this.tenants.provisionTenant({
      companyName: dto.companyName,
      ownerEmail: dto.email,
      ownerPasswordHash: passwordHash,
      ownerName: dto.name,
    });

    const owner = tenant.users[0];
    return this.issueTokens({ sub: owner.id, tenantId: tenant.id, role: owner.role });
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.asSystem().user.findUnique({
      where: { email: dto.email },
    });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const valid = await argon2.verify(user.passwordHash, dto.password);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    return this.issueTokens({ sub: user.id, tenantId: user.tenantId, role: user.role });
  }

  private issueTokens(identity: Identity) {
    return {
      accessToken: this.jwt.sign(
        { ...identity, type: 'access' } satisfies JwtPayload,
        { expiresIn: '15m' },
      ),
      refreshToken: this.jwt.sign(
        { ...identity, type: 'refresh' } satisfies JwtPayload,
        { expiresIn: '7d' },
      ),
    };
  }
}