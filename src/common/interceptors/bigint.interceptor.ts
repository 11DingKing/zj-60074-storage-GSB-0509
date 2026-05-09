import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

function bigIntReplacer(key: string, value: any): any {
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (value && typeof value === 'object') {
    if (Array.isArray(value)) {
      return value.map(item => bigIntReplacer('', item));
    }
    const result: any = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = bigIntReplacer(k, v);
    }
    return result;
  }
  return value;
}

@Injectable()
export class BigIntInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map(data => bigIntReplacer('', data)),
    );
  }
}
