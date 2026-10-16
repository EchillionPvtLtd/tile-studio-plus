import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatLKR(amount: number, options?: { withDecimals?: boolean; decimals?: number }): string {
  const minDecimals = options?.withDecimals ? (options?.decimals ?? 2) : 0;
  const maxDecimals = options?.withDecimals ? (options?.decimals ?? 2) : (amount % 1 !== 0 ? 2 : 0);
  return `LKR ${amount.toLocaleString('en-LK', { minimumFractionDigits: minDecimals, maximumFractionDigits: maxDecimals })}`;
}

export function formatNumber(n: number, decimals = 1): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
