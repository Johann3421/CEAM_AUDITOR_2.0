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
    desc.includes('COMPUTADORA') || cat.includes('COMPUTADORA') || cat.includes('ESCRITORIO') ||
    desc.includes('PROCESADOR:') || desc.includes('RAM:')
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

  if (rawCpu.includes('ULTRA 9') || rawCpu.includes('CORE ULTRA 9')) cpu = 'Intel Core Ultra 9';
  else if (rawCpu.includes('ULTRA 7') || rawCpu.includes('CORE ULTRA 7')) cpu = 'Intel Core Ultra 7';
  else if (rawCpu.includes('ULTRA 5') || rawCpu.includes('CORE ULTRA 5')) cpu = 'Intel Core Ultra 5';
  else if (rawCpu.includes('I9') || rawCpu.includes('CORE I9')) cpu = 'Intel Core i9';
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

  // 4. Disco / Almacenamiento (Soporta 500GB, 960GB, 256GB, 1TB, etc. sin excepciones)
  let storage = null;
  const storageMatch = desc.match(/(?:ALMACENAMIENTO|DISCO(?:\s+DURO)?):\s*([^;]+?)(?=\s+PANTALLA:|\s+SIST|\s+UNIDAD|\s+LAN:|\s+WLAN:|\s+PUERTOS:|$)/i);
  let rawStorage = storageMatch ? storageMatch[1] : '';
  if (!rawStorage) {
    const afterRam = desc.split(/RAM:/i)[1] || desc;
    const diskPattern = afterRam.match(/\b(\d+)\s*(GB|TB)\b(?:\s*(?:M\.2|NVME|SSD|HDD|SATA))/i) ||
                        afterRam.match(/(?:SSD|HDD|M\.2|NVME)\s*(?:DE)?\s*(\d+)\s*(GB|TB)/i) ||
                        afterRam.match(/\b(\d+)\s*(GB|TB)\b/i);
    if (diskPattern) {
      rawStorage = diskPattern[0];
    }
  }
  const storageSizeMatch = rawStorage.match(/\b(\d+)\s*(GB|TB)\b/i);
  if (storageSizeMatch) {
    const qty = storageSizeMatch[1];
    const unit = storageSizeMatch[2].toUpperCase();
    const type = (rawStorage.includes('HDD') || rawStorage.includes('MECANICO')) && !rawStorage.includes('SSD') ? 'HDD' : 'SSD';
    storage = `${qty} ${unit} ${type}`;
  }

  // 5. Pantalla (Pulgadas)
  let display = null;
  const displayMatch = desc.match(/PANTALLA:\s*([^;]+?)(?=\s+SIST|\s+UNIDAD|\s+LAN:|\s+WLAN:|\s+PUERTOS:|$)/i);
  const rawDisplay = displayMatch ? displayMatch[1] : desc;
  const sizeMatch = rawDisplay.match(/\b(10\.1|10\.4|10\.5|11|11\.6|12\.4|13\.3|14|15\.6|16|17\.3|19\.5|20|21\.5|23\.8|24|27|31\.5|32|34|43|55|65|75|85|86|98)(?:\s*(?:\"|\'\'|PULGADAS)|\b(?=\s*(?:FHD|HD|QHD|UHD|IPS|VA|TN|LED|4K|2K|60HZ|75HZ|100HZ|144HZ|165HZ|PLG)))/i);
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

  // 8. Conectividad (Monitores y PCs)
  const conectividad = [];
  if (desc.includes('HDMI')) conectividad.push('HDMI');
  if (desc.includes('DISPLAYPORT') || desc.includes('DP')) conectividad.push('DisplayPort');
  if (desc.includes('VGA')) conectividad.push('VGA');
  if (desc.includes('TYPE-C') || desc.includes('USB-C')) conectividad.push('USB-C');

  // 9. Sistema Operativo (Detección precisa: Windows, Linux o Sin SO / No Incluido)
  let os = null;
  const osMatch = desc.match(/SIST\.\s*OPER:\s*([^;]+?)(?=\s+UNIDAD|\s+TECLADO:|\s+PUERTOS:|$)/i);
  const rawOs = osMatch ? osMatch[1] : desc;
  if (rawOs.includes('WINDOWS 11 PRO') || rawOs.includes('W11 PRO') || rawOs.includes('WIN 11 PRO') || rawOs.includes('W11P')) os = 'Windows 11 Pro';
  else if (rawOs.includes('WINDOWS 11 HOME') || rawOs.includes('W11 HOME') || rawOs.includes('W11H') || rawOs.includes('WIN 11 HOME')) os = 'Windows 11 Home';
  else if (rawOs.includes('WINDOWS 10 PRO') || rawOs.includes('W10 PRO')) os = 'Windows 10 Pro';
  else if (rawOs.includes('WINDOWS 10 HOME') || rawOs.includes('W10 HOME')) os = 'Windows 10 Home';
  else if (rawOs.includes('UBUNTU') || rawOs.includes('LINUX') || rawOs.includes('FEDORA')) os = 'Linux / Ubuntu';
  else if (
    rawOs.includes('NO INCLUID') || rawOs.includes('NO INCLUYE') ||
    rawOs.includes('SIN SO') || rawOs.includes('SIN SISTEMA') ||
    rawOs.includes('NO TIENE') || rawOs.includes('FREEDOS') ||
    rawOs.includes('FREE DOS') || rawOs.includes('DOS') ||
    rawOs.includes('NINGUNO')
  ) {
    os = 'Sin SO (No incluido)';
  } else if (rawOs.includes('CHROME')) {
    os = 'ChromeOS';
  }

  // 10. Puertos y Conectividad (VGA, HDMI, LAN, WLAN, Bluetooth)
  const vga = desc.includes('VGA: SI') ? 'SI' : desc.includes('VGA: NO') ? 'NO' : (desc.includes('VGA') ? 'SI' : null);
  const hdmi = desc.includes('HDMI: SI') ? 'SI' : desc.includes('HDMI: NO') ? 'NO' : (desc.includes('HDMI') ? 'SI' : null);
  const wifi = desc.includes('WLAN: SI') || desc.includes('WI-FI') ? 'SI' : desc.includes('WLAN: NO') ? 'NO' : null;
  const bluetooth = desc.includes('BLUETOOTH: SI') ? 'SI' : desc.includes('BLUETOOTH: NO') ? 'NO' : null;
  const lan = desc.includes('LAN: SI') ? 'SI' : desc.includes('LAN: NO') ? 'NO' : null;
  const unidadOptica = desc.includes('UNIDAD OPTICA: SI') ? 'SI' : desc.includes('UNIDAD OPTICA: NO') ? 'NO' : null;
  const camara = desc.includes('CAMARA WEB: SI') ? 'SI' : desc.includes('CAMARA WEB: NO') ? 'NO' : null;
  const tactil = desc.includes('TACTIL') || desc.includes('TOUCH') ? 'SI' : null;

  // 11. Tecnologías de RAM y Disco
  let ramTech = null;
  if (desc.includes('LPDDR5')) ramTech = 'LPDDR5';
  else if (desc.includes('DDR5')) ramTech = 'DDR5';
  else if (desc.includes('DDR4')) ramTech = 'DDR4';

  let discoTipo = null;
  if (desc.includes('SSD') && desc.includes('HDD')) discoTipo = 'Híbrido SSD + HDD';
  else if (desc.includes('NVME')) discoTipo = 'NVMe M.2 SSD';
  else if (desc.includes('M.2')) discoTipo = 'M.2 SSD';
  else if (desc.includes('SSD')) discoTipo = 'SSD Sata/M.2';
  else if (desc.includes('HDD')) discoTipo = 'HDD Mecánico';

  // 12. Generación CPU
  let cpuGen = null;
  if (desc.includes('CORE ULTRA')) cpuGen = 'Core Ultra';
  else if (desc.includes('-14') || desc.includes(' 14700') || desc.includes(' 14400') || desc.includes(' 14900')) cpuGen = '14ª Gen';
  else if (desc.includes('-13') || desc.includes(' 13700') || desc.includes(' 13400') || desc.includes(' 13500')) cpuGen = '13ª Gen';
  else if (desc.includes('-12') || desc.includes(' 12700') || desc.includes(' 12400') || desc.includes(' 12100')) cpuGen = '12ª Gen';
  else if (desc.includes('-11') || desc.includes(' 11700') || desc.includes(' 11400')) cpuGen = '11ª Gen';
  else if (desc.includes('-10') || desc.includes(' 10700') || desc.includes(' 10400')) cpuGen = '10ª Gen';
  else if (desc.includes('RYZEN 7') || desc.includes('RYZEN 8')) cpuGen = 'Ryzen 7000/8000';
  else if (desc.includes('RYZEN 5')) cpuGen = 'Ryzen 5000';

  // 13. Office y Garantía
  let office = null;
  if (desc.includes('HOME & BUSINESS 2024') || desc.includes('HOME AND BUSINESS 2024')) office = 'Office H&B 2024';
  else if (desc.includes('HOME & BUSINESS 2021') || desc.includes('HOME AND BUSINESS 2021')) office = 'Office H&B 2021';
  else if (desc.includes('OFFICE HOME & BUSINESS') || desc.includes('OFFICE HOME AND BUSINESS')) office = 'Office Home & Business';
  else if (desc.includes('SUITE OFIMATICA: NO') || desc.includes('SIN OFFICE')) office = 'Sin Office';

  let garantia = null;
  if (desc.includes('36 MESES ON-SITE')) garantia = '36m On-Site';
  else if (desc.includes('36 MESES')) garantia = '36 Meses';
  else if (desc.includes('24 MESES')) garantia = '24 Meses';
  else if (desc.includes('12 MESES')) garantia = '12 Meses';

  // 14. Integración de Datos Oficiales extraídos de PDF (si existen en el item)
  const pdfSpecs = item.specs_pdf || item.raw_json?.specs_pdf || {};

  // Sobrescritura enriquecida si el PDF contiene especificaciones más limpias
  if (!cpu && pdfSpecs.procesador) { cpu = pdfSpecs.procesador; cpuFull = pdfSpecs.procesador; }
  if (!ram && pdfSpecs.ram) ram = pdfSpecs.ram;
  if (!storage && pdfSpecs.storage_resumen) storage = pdfSpecs.storage_resumen;
  if (!os && pdfSpecs.so_resumen) os = pdfSpecs.so_resumen;
  if (!panel && pdfSpecs.panel) panel = pdfSpecs.panel;
  if (!resolution && pdfSpecs.resolucion) resolution = pdfSpecs.resolucion;

  // 15. Tarjeta Gráfica (GPU dedicada/integrada)
  let gpuTipo = pdfSpecs.gpu_tipo || null;
  let gpuResumen = pdfSpecs.gpu_resumen || null;

  if (!gpuResumen) {
    const gpuMatch = desc.match(/(?:TARJETA DE VIDEO|VIDEO|GRAFICOS|GRAFICA):\s*([^;]+?)(?=\s+[A-Z0-9\s]+:|$)/i);
    const rawGpu = gpuMatch ? gpuMatch[1].trim() : '';
    if (rawGpu) {
      gpuResumen = rawGpu;
      if (/DEDICAD|PCIE|RTX|GTX|RADEON|GEFORCE|\b(?:0?4|6|8|12|16)\s*GB\b/i.test(rawGpu)) {
        gpuTipo = 'Dedicada';
      } else {
        gpuTipo = 'Integrada';
      }
    } else if (desc.includes('VIDEO: DEDICADO') || desc.includes('TARJETA DE VIDEO') || desc.includes('RTX') || desc.includes('GTX')) {
      gpuTipo = 'Dedicada';
      gpuResumen = 'Video Dedicado';
    } else if (family === 'computadoras') {
      gpuTipo = 'Integrada';
      gpuResumen = 'Gráficos Integrados';
    }
  }

  // 16. Fuente de Poder (PSU: Watts y Certificación 80+)
  let fuenteResumen = pdfSpecs.fuente_resumen || null;
  if (!fuenteResumen) {
    const fuenteMatch = desc.match(/FUENTE(?:\s+DE\s+PODER)?:\s*([^;]+?)(?=\s+[A-Z0-9\s]+:|$)/i);
    const rawFuente = fuenteMatch ? fuenteMatch[1].trim() : '';
    if (rawFuente) {
      fuenteResumen = rawFuente;
    } else {
      const wattsMatch = desc.match(/(\d+)\s*WATTS?/i);
      if (wattsMatch) {
        let cert = '';
        if (desc.includes('80 PLUS GOLD') || desc.includes('80+ GOLD')) cert = ' • 80+ Gold';
        else if (desc.includes('80 PLUS BRONZE') || desc.includes('80+ BRONZE')) cert = ' • 80+ Bronze';
        else if (desc.includes('80 PLUS') || desc.includes('80+')) cert = ' • 80+ White';
        fuenteResumen = `${wattsMatch[1]}W${cert}`;
      }
    }
  }

  // 17. Características Específicas de Monitores (Hz, ms, Brillo, Contraste)
  let monitorHz = pdfSpecs.monitor_hz || null;
  if (!monitorHz) {
    const hzMatch = desc.match(/\b(60|75|100|120|144|165|180|240)\s*HZ\b/i);
    if (hzMatch) monitorHz = `${hzMatch[1]} Hz`;
  }

  let monitorMs = pdfSpecs.monitor_ms || null;
  if (!monitorMs) {
    const msMatch = desc.match(/\b(\d+(?:\.\d+)?)\s*MS\b/i);
    if (msMatch) monitorMs = `${msMatch[1]} ms`;
  }

  let monitorBrillo = pdfSpecs.monitor_brillo || null;
  let monitorContraste = pdfSpecs.monitor_contraste || null;

  return {
    family,
    formFactor,
    cpu: cpu || null,
    cpuFull: cpuFull || cpu || null,
    cpuGen,
    ram: ram || null,
    ramTech,
    storage: storage || null,
    discoTipo,
    display: display || null,
    resolution: resolution || null,
    panel: panel || null,
    conectividad: conectividad.length > 0 ? conectividad.join(' • ') : null,
    vga,
    hdmi,
    wifi,
    bluetooth,
    lan,
    unidadOptica,
    camara,
    tactil,
    office,
    garantia,
    os: os || null,
    gpuTipo: gpuTipo || null,
    gpuResumen: gpuResumen || null,
    fuenteResumen: fuenteResumen || null,
    monitorHz: monitorHz || null,
    monitorMs: monitorMs || null,
    monitorBrillo: monitorBrillo || null,
    monitorContraste: monitorContraste || null,
  };
}

