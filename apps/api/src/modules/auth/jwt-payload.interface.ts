export interface JwtPayload {
  sub: string; // user id
  tenantId: string;
  role: string;
  type: 'access' | 'refresh';
}