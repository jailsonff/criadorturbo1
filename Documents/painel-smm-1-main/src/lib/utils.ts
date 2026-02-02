import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formata um valor numérico para moeda brasileira (BRL)
 * @param value - Valor numérico a ser formatado
 * @param showDecimals - Se deve mostrar casas decimais (padrão: 2)
 * @returns String formatada em BRL (ex: "R$ 1.234,56")
 */
export function formatCurrency(value: number | null | undefined, showDecimals: number = 2): string {
  const numValue = Number(value);
  if (!Number.isFinite(numValue)) {
    return "R$ 0,00";
  }
  // Format with comma as thousands separator (US format) but with R$ symbol
  const formatted = numValue.toLocaleString("pt-BR", {
    minimumFractionDigits: showDecimals,
    maximumFractionDigits: showDecimals,
  });
  return `R$ ${formatted}`;
}

/**
 * Formata um valor para moeda com precisão dinâmica (exibe casas decimais extras se necessário)
 * Ex: 0.272 -> "R$ 0,272", 1.50 -> "R$ 1,50"
 * @param value - Valor numérico a ser formatado
 * @returns String formatada em BRL com precisão adequada
 */
export function formatCurrencyPrecise(value: number | null | undefined): string {
  const numValue = Number(value);
  if (!Number.isFinite(numValue)) {
    return "R$ 0,00";
  }
  
  // Determine the number of decimal places needed (min 2, max 4)
  const str = numValue.toString();
  const decimalPart = str.includes('.') ? str.split('.')[1] : '';
  const neededDecimals = Math.min(4, Math.max(2, decimalPart.length));
  
  const formatted = numValue.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: neededDecimals,
  });
  return `R$ ${formatted}`;
}

/**
 * Formata um valor numérico para exibição simples em BRL (sem símbolo completo)
 * @param value - Valor numérico a ser formatado
 * @param decimals - Número de casas decimais (padrão: 2)
 * @returns String formatada (ex: "1.234,56")
 */
export function formatNumber(value: number | null | undefined, decimals: number = 2): string {
  const numValue = Number(value);
  if (!Number.isFinite(numValue)) {
    return "0,00";
  }
  return numValue.toLocaleString("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Extrai o tempo médio/estimado do nome ou descrição de um serviço
 * Procura por padrões como:
 * - "Inicio: 0-30 Minutos"
 * - "Inicio: 0-15 min"
 * - "início: 0-1H"
 * - "⏱ 15 minutos"
 * - "Tempo médio: 9 minutos"
 * @param text - Nome ou descrição do serviço
 * @returns String com o tempo extraído ou null se não encontrado
 */
export function extractAverageTime(text: string | null | undefined): string | null {
  if (!text) return null;
  
  const lowerText = text.toLowerCase();
  
  // Pattern: "Inicio: X-Y Minutos" or "Inicio: X-Y min" or "início: X-Yh"
  const inicioPattern = /in[ií]cio[:\s]+(\d+[-–]\d+\s*(?:minutos?|min|horas?|h|segundos?|seg)|\d+\s*(?:minutos?|min|horas?|h|segundos?|seg))/i;
  const inicioMatch = text.match(inicioPattern);
  if (inicioMatch) {
    return formatExtractedTime(inicioMatch[1]);
  }
  
  // Pattern: "Tempo médio: X minutos" or "tempo: X min"
  const tempoPattern = /tempo\s*(?:m[eé]dio)?[:\s]+(\d+[-–]?\d*\s*(?:minutos?|min|horas?|h|segundos?|seg))/i;
  const tempoMatch = text.match(tempoPattern);
  if (tempoMatch) {
    return formatExtractedTime(tempoMatch[1]);
  }
  
  // Pattern: "⏱ X minutos" or clock emoji with time
  const emojiPattern = /[⏱⏰🕐🕑🕒🕓🕔🕕🕖🕗🕘🕙🕚🕛]\s*(\d+[-–]?\d*\s*(?:minutos?|min|horas?|h))/i;
  const emojiMatch = text.match(emojiPattern);
  if (emojiMatch) {
    return formatExtractedTime(emojiMatch[1]);
  }
  
  // Pattern: standalone time at end like "| 0-15 min" or "- 30 minutos"
  const standalonePattern = /[|\-–]\s*(\d+[-–]\d+\s*(?:minutos?|min))\s*$/i;
  const standaloneMatch = text.match(standalonePattern);
  if (standaloneMatch) {
    return formatExtractedTime(standaloneMatch[1]);
  }
  
  return null;
}

/**
 * Formata o tempo extraído para um formato mais legível
 */
function formatExtractedTime(time: string): string {
  let formatted = time.trim();
  
  // Normalize dashes
  formatted = formatted.replace(/–/g, '-');
  
  // Expand abbreviations
  formatted = formatted.replace(/\bmin\b/gi, 'minutos');
  formatted = formatted.replace(/\bh\b/gi, 'horas');
  formatted = formatted.replace(/\bseg\b/gi, 'segundos');
  
  // Capitalize first letter
  formatted = formatted.charAt(0).toUpperCase() + formatted.slice(1).toLowerCase();
  
  return formatted;
}
