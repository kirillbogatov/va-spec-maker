// Шрифты, встраиваемые в экспорт схемы: файл выглядит одинаково и без установленного IBM Plex.
// Модуль грузится динамически только при экспорте, чтобы не утяжелять основную сборку.
import sansCyr400 from '@fontsource/ibm-plex-sans/files/ibm-plex-sans-cyrillic-400-normal.woff2?inline';
import sansLat400 from '@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff2?inline';
import sansCyr400i from '@fontsource/ibm-plex-sans/files/ibm-plex-sans-cyrillic-400-italic.woff2?inline';
import sansLat400i from '@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-400-italic.woff2?inline';
import sansCyr500 from '@fontsource/ibm-plex-sans/files/ibm-plex-sans-cyrillic-500-normal.woff2?inline';
import sansLat500 from '@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-500-normal.woff2?inline';
import sansCyr600 from '@fontsource/ibm-plex-sans/files/ibm-plex-sans-cyrillic-600-normal.woff2?inline';
import sansLat600 from '@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-600-normal.woff2?inline';
import monoCyr400 from '@fontsource/ibm-plex-mono/files/ibm-plex-mono-cyrillic-400-normal.woff2?inline';
import monoLat400 from '@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2?inline';
import monoCyr500 from '@fontsource/ibm-plex-mono/files/ibm-plex-mono-cyrillic-500-normal.woff2?inline';
import monoLat500 from '@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2?inline';

// Диапазоны из @fontsource: без них начертание одного веса перекрыло бы другое
const CYR = 'U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116';
const LAT = 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';

const face = (family: string, weight: number, italic: boolean, src: string, range: string) =>
  `@font-face{font-family:'${family}';font-style:${italic ? 'italic' : 'normal'};font-weight:${weight};src:url(${src}) format('woff2');unicode-range:${range}}`;

export const SCHEME_FONT_CSS = [
  face('IBM Plex Sans', 400, false, sansCyr400, CYR), face('IBM Plex Sans', 400, false, sansLat400, LAT),
  face('IBM Plex Sans', 400, true, sansCyr400i, CYR), face('IBM Plex Sans', 400, true, sansLat400i, LAT),
  face('IBM Plex Sans', 500, false, sansCyr500, CYR), face('IBM Plex Sans', 500, false, sansLat500, LAT),
  face('IBM Plex Sans', 600, false, sansCyr600, CYR), face('IBM Plex Sans', 600, false, sansLat600, LAT),
  face('IBM Plex Mono', 400, false, monoCyr400, CYR), face('IBM Plex Mono', 400, false, monoLat400, LAT),
  face('IBM Plex Mono', 500, false, monoCyr500, CYR), face('IBM Plex Mono', 500, false, monoLat500, LAT),
].join('');
