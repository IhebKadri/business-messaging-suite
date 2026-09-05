import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class TenantsService {
  constructor(private readonly prisma: PrismaService) {}

  // signup is inherently cross-tenant (no tenant exists yet), so this goes through asSystem() instead of prisma.scoped — one of the few legit uses of the bypass.
  async provisionTenant(params: {
    companyName: string;
    ownerEmail: string;
    ownerPasswordHash: string;
    ownerName: string;
  }) {
    const slug = slugify(params.companyName);

    const existingSlug = await this.prisma.asSystem().tenant.findUnique({
      where: { slug },
    });
    if (existingSlug) {
      throw new ConflictException('A workspace with a similar name already exists');
    }

    const existingUser = await this.prisma.asSystem().user.findUnique({
      where: { email: params.ownerEmail },
    });
    if (existingUser) {
      throw new ConflictException('An account with this email already exists');
    }

    return this.prisma.asSystem().tenant.create({
      data: {
        name: params.companyName,
        slug,
        users: {
          create: {
            email: params.ownerEmail,
            passwordHash: params.ownerPasswordHash,
            name: params.ownerName,
            role: 'OWNER',
          },
        },
      },
      include: { users: true },
    });
  }
}

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  const suffix = Math.random().toString(36).slice(2, 7);
  return `${base}-${suffix}`;
}
