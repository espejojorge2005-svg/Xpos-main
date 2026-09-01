/**
 * Configuración y Utilidades de Zona Horaria Oficial para Perú (America/Lima / UTC-5)
 */

export const PERU_TIMEZONE = 'America/Lima';
export const PERU_LOCALE = 'es-PE';

/**
 * Convierte cualquier entrada a un objeto Date válido
 */
export const toValidDate = (input: string | number | Date | null | undefined): Date => {
  if (!input) return new Date();
  if (input instanceof Date) return isNaN(input.getTime()) ? new Date() : input;
  const d = new Date(input);
  return isNaN(d.getTime()) ? new Date() : d;
};

/**
 * Formatea una fecha en formato peruano (ej: 31/08/2026)
 */
export const formatPeruDate = (
  date: string | number | Date | null | undefined,
  options?: Intl.DateTimeFormatOptions
): string => {
  const d = toValidDate(date);
  return d.toLocaleDateString(PERU_LOCALE, {
    timeZone: PERU_TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...options
  });
};

/**
 * Formatea la hora en formato peruano (ej: 08:30 p.m. o 20:30:00)
 */
export const formatPeruTime = (
  date: string | number | Date | null | undefined,
  options?: Intl.DateTimeFormatOptions
): string => {
  const d = toValidDate(date);
  return d.toLocaleTimeString(PERU_LOCALE, {
    timeZone: PERU_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    ...options
  });
};

/**
 * Formatea fecha y hora completa en Perú (ej: 31/08/2026, 08:30 p.m.)
 */
export const formatPeruDateTime = (
  date: string | number | Date | null | undefined,
  options?: Intl.DateTimeFormatOptions
): string => {
  const d = toValidDate(date);
  return d.toLocaleString(PERU_LOCALE, {
    timeZone: PERU_TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    ...options
  });
};

/**
 * Calcula y formatea el tiempo transcurrido desde la creación del pedido
 */
export const formatWaitTime = (
  orderDateInput: string | number | Date | null | undefined,
  nowInput: string | number | Date = new Date()
): string => {
  const orderTime = toValidDate(orderDateInput).getTime();
  const nowTime = toValidDate(nowInput).getTime();
  const diffMs = nowTime - orderTime;

  if (diffMs < 0) return '0s';

  const diffSecs = Math.floor(diffMs / 1000);
  const hours = Math.floor(diffSecs / 3600);
  const minutes = Math.floor((diffSecs % 3600) / 60);
  const seconds = diffSecs % 60;

  if (hours > 0) {
    return `${hours}h ${minutes.toString().padStart(2, '0')}m ${seconds.toString().padStart(2, '0')}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
  }
  return `${seconds}s`;
};
