import {
  Controller,
  Get,
  Put,
  Delete,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LibraryService } from './library.service';
import { SyncLibraryDto } from './dto/sync-library.dto';

@Controller('library')
@UseGuards(JwtAuthGuard)
export class LibraryController {
  constructor(private readonly libraryService: LibraryService) {}

  @Get()
  getLibrary(@Req() req: { user: { id: string } }) {
    return this.libraryService.getLibrary(req.user.id);
  }

  @Put('sync')
  syncLibrary(
    @Req() req: { user: { id: string } },
    @Body() dto: SyncLibraryDto,
  ) {
    return this.libraryService.syncLibrary(req.user.id, dto);
  }

  @Delete()
  async deleteLibrary(@Req() req: { user: { id: string } }) {
    await this.libraryService.deleteLibrary(req.user.id);
    return { ok: true };
  }

  @Get('exists')
  async hasLibrary(@Req() req: { user: { id: string } }) {
    const exists = await this.libraryService.hasLibrary(req.user.id);
    return { exists };
  }
}
