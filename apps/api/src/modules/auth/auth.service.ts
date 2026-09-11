import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { PrismaService } from '../../common/prisma.service';
import { AuthUser, Role } from '../../common/guards/rbac';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService, private readonly jwt: JwtService) {}

  static hashPassword(plain: string): Promise<string> {
    return argon2.hash(plain, { type: argon2.argon2id });
  }

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.active) throw new UnauthorizedException('Credenciais inválidas.');
    const ok = await argon2.verify(user.passwordHash, password);
    if (!ok) throw new UnauthorizedException('Credenciais inválidas.');

    const membership = await this.prisma.membership.findFirst({ where: { userId: user.id } });
    const role = (membership?.role as Role) ?? 'VIEWER';
    const payload: AuthUser = { userId: user.id, orgId: user.orgId, role, email: user.email };

    await this.prisma.auditLog.create({
      data: { orgId: user.orgId, userId: user.id, action: 'AUTH_LOGIN', entity: 'user', entityId: user.id },
    });

    return this.issueTokens(payload);
  }

  async refresh(refreshToken: string) {
    try {
      const payload = await this.jwt.verifyAsync(refreshToken, { secret: process.env.JWT_REFRESH_SECRET });
      const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user || !user.active) throw new Error('user');
      const membership = await this.prisma.membership.findFirst({ where: { userId: user.id } });
      return this.issueTokens({
        userId: user.id, orgId: user.orgId,
        role: (membership?.role as Role) ?? 'VIEWER', email: user.email,
      });
    } catch {
      throw new UnauthorizedException('Refresh token inválido ou expirado.');
    }
  }

  private async issueTokens(user: AuthUser) {
    const base = { sub: user.userId, orgId: user.orgId, role: user.role, email: user.email };
    const accessToken = await this.jwt.signAsync(base, {
      secret: process.env.JWT_ACCESS_SECRET, expiresIn: process.env.JWT_ACCESS_TTL || '15m',
    });
    const refreshToken = await this.jwt.signAsync({ sub: user.userId }, {
      secret: process.env.JWT_REFRESH_SECRET, expiresIn: process.env.JWT_REFRESH_TTL || '7d',
    });
    return { accessToken, refreshToken, user };
  }
}
