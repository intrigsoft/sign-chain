import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SyncLibraryDto } from './dto/sync-library.dto';

@Injectable()
export class LibraryService {
  constructor(private readonly prisma: PrismaService) {}

  async getLibrary(userId: string) {
    const [signatures, textSnippets] = await Promise.all([
      this.prisma.cloudSignature.findMany({ where: { userId } }),
      this.prisma.cloudTextSnippet.findMany({ where: { userId } }),
    ]);
    return { signatures, textSnippets };
  }

  async syncLibrary(userId: string, dto: SyncLibraryDto) {
    await this.prisma.$transaction(async (tx) => {
      // Delete items
      if (dto.deletedSignatureIds.length > 0) {
        await tx.cloudSignature.deleteMany({
          where: { id: { in: dto.deletedSignatureIds }, userId },
        });
      }
      if (dto.deletedSnippetIds.length > 0) {
        await tx.cloudTextSnippet.deleteMany({
          where: { id: { in: dto.deletedSnippetIds }, userId },
        });
      }

      // Upsert signatures (last-write-wins via updatedAt)
      for (const sig of dto.signatures) {
        const clientUpdatedAt = new Date(sig.updatedAt);
        const existing = await tx.cloudSignature.findUnique({
          where: { id: sig.id },
          select: { updatedAt: true },
        });

        if (!existing || clientUpdatedAt > existing.updatedAt) {
          await tx.cloudSignature.upsert({
            where: { id: sig.id },
            create: {
              id: sig.id,
              userId,
              label: sig.label,
              base64Png: sig.base64Png,
            },
            update: {
              label: sig.label,
              base64Png: sig.base64Png,
            },
          });
        }
      }

      // Upsert text snippets
      for (const sn of dto.textSnippets) {
        const clientUpdatedAt = new Date(sn.updatedAt);
        const existing = await tx.cloudTextSnippet.findUnique({
          where: { id: sn.id },
          select: { updatedAt: true },
        });

        if (!existing || clientUpdatedAt > existing.updatedAt) {
          await tx.cloudTextSnippet.upsert({
            where: { id: sn.id },
            create: {
              id: sn.id,
              userId,
              label: sn.label,
              text: sn.text,
              fontSize: sn.fontSize,
            },
            update: {
              label: sn.label,
              text: sn.text,
              fontSize: sn.fontSize,
            },
          });
        }
      }
    });

    // Return full updated library for client reconciliation
    return this.getLibrary(userId);
  }

  async deleteLibrary(userId: string) {
    await this.prisma.$transaction([
      this.prisma.cloudSignature.deleteMany({ where: { userId } }),
      this.prisma.cloudTextSnippet.deleteMany({ where: { userId } }),
    ]);
  }

  async hasLibrary(userId: string): Promise<boolean> {
    const count = await this.prisma.cloudSignature.count({
      where: { userId },
      take: 1,
    });
    if (count > 0) return true;

    const snippetCount = await this.prisma.cloudTextSnippet.count({
      where: { userId },
      take: 1,
    });
    return snippetCount > 0;
  }
}
