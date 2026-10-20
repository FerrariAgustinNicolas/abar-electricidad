import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { AuthSessionService } from '../../core/auth/auth-session.service';

export function isAdminCatalogCsrfInvalid(error: unknown): boolean {
  return error instanceof HttpErrorResponse && error.status === 403 &&
    typeof error.error?.code === 'string' && error.error.code === 'CSRF_INVALID';
}

export async function handleAdminCatalogSessionFailure(
  error: unknown, auth: AuthSessionService, router: Router, returnUrl: string,
): Promise<void> {
  if (!(error instanceof HttpErrorResponse) || error.status !== 401) return;
  auth.expire();
  await router.navigate(['/admin/login'], { queryParams: { returnUrl } });
}

export function adminCatalogError(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    const body = error.error as { code?: unknown; message?: unknown } | null;
    const code = typeof body?.code === 'string' ? body.code : '';
    if (error.status === 401) return 'La sesión venció. Inicie sesión nuevamente.';
    if (error.status === 403 && code === 'CSRF_INVALID') return 'La sesión cambió en otra pestaña. No se repitió la acción. Actualice la sesión para un nuevo intento.';
    if (error.status === 403) return 'La sesión no permite esta operación. Verifique el acceso administrativo.';
    if (error.status === 409) return conflictMessage(code);
    if (error.status === 413) return 'La imagen supera el tamaño máximo de 5 MiB.';
    if (error.status === 415) return 'El archivo no es una imagen PNG válida.';
    if (error.status === 0 || error.status >= 500) return 'No se pudo completar la operación. Revise la conexión e intente nuevamente.';
    return typeof body?.message === 'string' ? body.message : 'No se pudo completar la operación. Revise los datos e intente nuevamente.';
  }
  return error instanceof Error ? error.message : 'No se pudo completar la operación.';
}

function conflictMessage(code: string): string {
  switch (code) {
    case 'VERSION_CONFLICT': return 'Otra persona actualizó estos datos. Los cambios siguen en el formulario; recargue antes de volver a guardar.';
    case 'CATEGORY_HAS_ACTIVE_PRODUCTS': return 'La categoría contiene productos activos. Reasigne o desactive esos productos antes de desactivarla.';
    case 'CATEGORY_SET_CHANGED': return 'La lista de categorías cambió. Actualícela antes de guardar el orden.';
    case 'SKU_IN_USE': return 'Ese SKU ya está asignado a otro producto.';
    case 'SLUG_IN_USE': return 'Ese identificador ya está en uso.';
    case 'PRESENTATION_IMMUTABLE': return 'No se puede cambiar la unidad o longitud de una presentación con movimientos.';
    case 'INSUFFICIENT_STOCK': return 'No hay suficientes rollos cerrados para realizar la apertura.';
    case 'IMAGE_LIMIT_REACHED': return 'El producto ya alcanzó el máximo de ocho imágenes.';
    default: return 'Los datos cambiaron en el servidor. Los cambios se conservaron; actualice los datos antes de reintentar.';
  }
}
