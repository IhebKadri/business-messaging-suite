import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RequestContext } from '../../../common/context/request-context';
import { JwtPayload } from '../jwt-payload.interface';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const ok = (await super.canActivate(context)) as boolean;
    if (!ok) return false;

    const req = context.switchToHttp().getRequest();
    const user = req.user as JwtPayload;

    const store = RequestContext.get();
    if (store) {
      store.tenantId = user.tenantId;
      store.userId = user.sub;
    }

    return true;
  }
}
