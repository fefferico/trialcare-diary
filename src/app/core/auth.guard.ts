import { inject } from '@angular/core';
import { CanActivateFn } from '@angular/router';
import { AuthService } from './auth.service';

export const requireAuthentication: CanActivateFn = async () => {
  const auth = inject(AuthService);
  await auth.ready;
  return Boolean(auth.user());
};
