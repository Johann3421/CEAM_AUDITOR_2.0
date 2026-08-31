/**
 * Parser de especificaciones técnicas a partir de la descripción y categoría de Perú Compras.
 * Extrae componentes atómicos (CPU, RAM, Disco, Pantalla, Resolución, Panel, SO, etc.)
 */

export function parseProductSpecs(item) {
  const rawDesc = item.descripcion || item.descripcion_producto || '';
  const desc = rawDesc.toUpperCase();
  const cat = (item.categoria || item.catalogo || '').toUpperCase();
  const marca = (item.marca || '').toUpperCase();

  // 1. Familia de Producto y Form Factor
  let family = 'computadoras';
  let formFactor = 'Desktop / Torre';

  if (desc.includes('MONITOR') || cat.includes('MONITOR') || desc.startsWith('MONITOR')) {
    family = 'monitores';
    formFactor = 'Monitor';
  } else if (desc.includes('ESCANER') || desc.includes('ESCÁNER') || cat.includes('ESCANER') || cat.includes('ESCÁNER')) {
    family = 'escaneres';
    formFactor = desc.includes('PLANO') ? 'Escáner de Planos' : desc.includes('LIBRO') ? 'Escáner de Libros' : 'Escáner de Documentos';
  } else if (desc.includes('TABLET') || cat.includes('TABLET')) {
    family = 'tablets';
    formFactor = 'Tablet';
  } else if (
    desc.includes('PORTATIL') || desc.includes('PORTÁTIL') || desc.includes('LAPTOP') || desc.includes('NOTEBOOK') ||
    cat.includes('PORTATIL') || cat.includes('PORTÁTIL')
  ) {
    family = 'computadoras';
    formFactor = (desc.includes('ESTACION') || desc.includes('WORKSTATION')) ? 'Workstation Portátil' : 'Laptop / Portátil';
  } else if (
    desc.includes('TODO EN UNO') || desc.includes('ALL IN ONE') || desc.includes('ALL-IN-ONE') || desc.includes('AIO') ||
    cat.includes('TODO EN UNO')
  ) {
    family = 'computadoras';
    formFactor = 'Todo en Uno (AIO)';
  } else if (desc.includes('ESTACION') || desc.includes('WORKSTATION') || cat.includes('ESTACION')) {
    family = 'computadoras';
    formFactor = 'Workstation';
  } else if (
    desc.includes('ESCRITORIO') || desc.includes('TORRE') || desc.includes('SFF') || desc.includes('MINI PC') ||
    cat.includes('ESCRITORIO')
  ) {
    family = 'computadoras';
    formFactor = 'Desktop / Torre';
  } else {
    family = 'otros';
    formFactor = 'Accesorio / Componente';
  }

  // 2. Procesador (CPU)
  let cpu = null;
  let cpuFull = null;
  const cpuMatch = desc.match(/PROCESADOR:\s*([^;]+?)(?=\s+RAM:|\s+ALMACENAMIENTO:|\s+PANTALLA:|\s+SIST|\s+UNIDAD|$)/i);
  const rawCpu = cpuMatch ? cpuMatch[1].trim() : desc;

  if (rawCpu.includes('I9') || rawCpu.includes('CORE I9')) cpu = 'Intel Core i9';
  else if (rawCpu.includes('I7') || rawCpu.includes('CORE I7') || rawCpu.includes('12700') || rawCpu.includes('13700') || rawCpu.includes('1255U') || rawCpu.includes('1355U') || rawCpu.includes('1165G7')) cpu = 'Intel Core i7';
  else if (rawCpu.includes('I5') || rawCpu.includes('CORE I5') || rawCpu.includes('12400') || rawCpu.includes('13400') || rawCpu.includes('1235U') || rawCpu.includes('1135G7') || rawCpu.includes('10505')) cpu = 'Intel Core i5';
  else if (rawCpu.includes('I3') || rawCpu.includes('CORE I3') || rawCpu.includes('1215U') || rawCpu.includes('1315U') || rawCpu.includes('1115G4') || rawCpu.includes('10100')) cpu = 'Intel Core i3';
  else if (rawCpu.includes('RYZEN 9')) cpu = 'AMD Ryzen 9';
  else if (rawCpu.includes('RYZEN 7') || rawCpu.includes('5700') || rawCpu.includes('7700') || rawCpu.includes('5800')) cpu = 'AMD Ryzen 7';
  else if (rawCpu.includes('RYZEN 5') || rawCpu.includes('5500') || rawCpu.includes('5600') || rawCpu.includes('7520') || rawCpu.includes('7530')) cpu = 'AMD Ryzen 5';
  else if (rawCpu.includes('RYZEN 3') || rawCpu.includes('5300') || rawCpu.includes('7320')) cpu = 'AMD Ryzen 3';
  else if (rawCpu.includes('CELERON') || rawCpu.includes('N4020') || rawCpu.includes('N4500') || rawCpu.includes('N100')) cpu = 'Intel Celeron';
  else if (rawCpu.includes('PENTIUM')) cpu = 'Intel Pentium';
  else if (rawCpu.includes('XEON')) cpu = 'Intel Xeon';

  if (cpuMatch) {
    cpuFull = cpuMatch[1].replace(/INTEL CORE/gi, 'Intel Core').replace(/AMD RYZEN/gi, 'Ryzen').trim();
    if (cpuFull.length > 28) cpuFull = cpu || cpuFull.slice(0, 28);
  } else {
    cpuFull = cpu;
  }

  // 3. Memoria RAM
  let ram = null;
  const ramMatch = desc.match(/RAM:\s*([^;]+?)(?=\s+ALMACENAMIENTO:|\s+PANTALLA:|\s+SIST|\s+UNIDAD|$)/i);
  const rawRam = ramMatch ? ramMatch[1] : desc;
  const ramSizeMatch = rawRam.match(/\b(4|8|12|16|24|32|64|128)\s*GB\b/i);
  if (ramSizeMatch) {
    ram = `${ramSizeMatch[1]} GB`;
  }

  // 4. Disco / Almacenamiento
  let storage = null;
  const storageMatch = desc.match(/ALMACENAMIENTO:\s*([^;]+?)(?=\s+PANTALLA:|\s+SIST|\s+UNIDAD|\s+LAN:|$)/i);
  const rawStorage = storageMatch ? storageMatch[1] : desc;
  const storageSizeMatch = rawStorage.match(/\b(128|256|512)\s*GB(?:\s*(SSD|NVME|M\.2|HDD))?|\b(1|2|4)\s*TB(?:\s*(SSD|NVME|M\.2|HDD))?/i);
  if (storageSizeMatch) {
    const gb = storageSizeMatch[1];
    const tb = storageSizeMatch[3];
    const type = (rawStorage.includes('HDD') || rawStorage.includes('MECANICO')) ? 'HDD' : 'SSD';
    if (gb) storage = `${gb} GB ${type}`;
    else if (tb) storage = `${tb} TB ${type}`;
  }

  // 5. Pantalla (Pulgadas)
  let display = null;
  const displayMatch = desc.match(/PANTALLA:\s*([^;]+?)(?=\s+SIST|\s+UNIDAD|\s+LAN:|\s+WLAN:|\s+PUERTOS:|$)/i);
  const rawDisplay = displayMatch ? displayMatch[1] : desc;
  const sizeMatch = rawDisplay.match(/\b(10\.1|10\.4|10\.5|11|11\.6|12\.4|13\.3|14|15\.6|16|17\.3|19\.5|20|21\.5|23\.8|24|27|31\.5|32|34|43|55|65|75|85|86|98)(?:\s*(?:\"|\'\'|PULGADAS)|\b(?=\s*(?:FHD|HD|QHD|UHD|IPS|VA|TN|LED|4K|2K|60HZ|75HZ|144HZ|165HZ|PLG)))/i);
  if (sizeMatch) {
    display = `${sizeMatch[1]}"`;
  } else if (family === 'computadoras' && formFactor === 'Desktop / Torre') {
    display = 'Sin pantalla';
  }

  // 6. Resolución
  let resolution = null;
  if (desc.includes('3840X2160') || desc.includes('4K') || desc.includes('UHD')) resolution = '4K UHD (3840x2160)';
  else if (desc.includes('2560X1440') || desc.includes('2K') || desc.includes('QHD')) resolution = '2K QHD (2560x1440)';
  else if (desc.includes('1920X1080') || desc.includes('FHD') || desc.includes('FULL HD')) resolution = 'FHD (1920x1080)';
  else if (desc.includes('1600X900') || desc.includes('HD+')) resolution = 'HD+ (1600x900)';
  else if (desc.includes('1366X768') || desc.includes('1280X720') || desc.includes('HD')) resolution = 'HD (1366x768)';

  // 7. Tipo de Panel (Monitores)
  let panel = null;
  if (desc.includes('IPS') || desc.includes('AH-IPS') || desc.includes('PLS')) panel = 'IPS';
  else if (desc.includes(' VA ') || desc.includes('VA-LED') || desc.includes('PANEL: VA') || desc.startsWith('VA')) panel = 'VA';
  else if (desc.includes(' TN ') || desc.includes('PANEL: TN')) panel = 'TN';
  else if (desc.includes('OLED')) panel = 'OLED';

  // 8. Conectividad (Monitores)
  const conectividad = [];
  if (desc.includes('HDMI')) conectividad.push('HDMI');
  if (desc.includes('DISPLAYPORT') || desc.includes('DP')) conectividad.push('DisplayPort');
  if (desc.includes('VGA')) conectividad.push('VGA');
  if (desc.includes('TYPE-C') || desc.includes('USB-C')) conectividad.push('USB-C');

  // 9. Sistema Operativo
  let os = null;
  const osMatch = desc.match(/SIST\.\s*OPER:\s*([^;]+?)(?=\s+UNIDAD|\s+TECLADO:|\s+PUERTOS:|$)/i);
  const rawOs = osMatch ? osMatch[1] : desc;
  if (rawOs.includes('WINDOWS 11 PRO') || rawOs.includes('W11 PRO') || rawOs.includes('WIN 11 PRO') || rawOs.includes('W11P')) os = 'Windows 11 Pro';
  else if (rawOs.includes('WINDOWS 11 HOME') || rawOs.includes('W11 HOME') || rawOs.includes('W11H') || rawOs.includes('WIN 11 HOME')) os = 'Windows 11 Home';
  else if (rawOs.includes('WINDOWS 10 PRO') || rawOs.includes('W10 PRO')) os = 'Windows 10 Pro';
  else if (rawOs.includes('UBUNTU') || rawOs.includes('LINUX')) os = 'Linux / Ubuntu';
  else if (rawOs.includes('FREEDOS') || rawOs.includes('FREE DOS') || rawOs.includes('DOS') || rawOs.includes('NO TIENE') || rawOs.includes('SIN SISTEMA')) os = 'FreeDOS / Sin SO';

  return {
    family,
    formFactor,
    cpu: cpu || null,
    cpuFull: cpuFull || cpu || null,
    ram: ram || null,
    storage: storage || null,
    display: display || null,
    resolution: resolution || null,
    panel: panel || null,
    conectividad: conectividad.length > 0 ? conectividad.join(' • ') : null,
    os: os || null,
  };
}
