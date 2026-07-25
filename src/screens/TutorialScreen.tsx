import React, { useState, useMemo } from 'react';
import { useLang } from '../LangContext';
import { strings } from '../i18n';

// ── Design tokens ─────────────────────────────────────────────────────────────
const NAVY      = '#143A63';
const BLUE_ACC  = '#3B82F6';
const CARD      = '#FFFFFF';
const SURFACE   = '#F0EEE8';
const TEXT_PRI  = '#111827';
const TEXT_SEC  = '#374151';
const TEXT_MID  = '#4B5563';
const BORDER    = '#E5E7EB';

// ── Inline UI strings (not in i18n.ts) ───────────────────────────────────────
const UI: Record<string, Record<string, string | ((n: number) => string)>> = {
  en: {
    faqTab:            'FAQ',
    vidTab:            'Tutorial Videos',
    faqPlaceholder:    'Search FAQs…',
    vidPlaceholder:    'Search tutorial videos…',
    resultFound:       (n: number) => `${n} result${n !== 1 ? 's' : ''} found`,
    noFaqLabel:        'No matching FAQs found.',
    noFaqHint:         'Try another keyword.',
    noVidLabel:        'No tutorials found.',
    noVidHint:         'Try a different keyword.',
    footerNote:        'New tutorials are added regularly. Check back soon for more guides.',
  },
  es: {
    faqTab:            'Preguntas',
    vidTab:            'Videos',
    faqPlaceholder:    'Buscar preguntas frecuentes…',
    vidPlaceholder:    'Buscar videos tutoriales…',
    resultFound:       (n: number) => `${n} resultado${n !== 1 ? 's' : ''} encontrado${n !== 1 ? 's' : ''}`,
    noFaqLabel:        'No se encontraron preguntas.',
    noFaqHint:         'Intenta con otra palabra clave.',
    noVidLabel:        'No se encontraron tutoriales.',
    noVidHint:         'Intenta con otra palabra clave.',
    footerNote:        'Se agregan tutoriales regularmente. Vuelve pronto para más guías.',
  },
};

// ── FAQ category type ─────────────────────────────────────────────────────────
interface FaqItem     { q: string; a: string }
interface FaqCategory { id: string; icon: string; title: string; color: string; items: FaqItem[] }

// ── FAQ data (EN) ─────────────────────────────────────────────────────────────
const FAQ_EN: FaqCategory[] = [
  {
    id: 'getting-started', icon: '🚀', color: '#0284C7', title: 'Getting Started',
    items: [
      { q: 'What is Grade and Elevation Calculator?',
        a: 'A free professional field tool for construction crews and surveyors. It handles rod readings, benchmark verification, grade calculations, and elevation tracking — replacing paper field books for everyday site work.' },
      { q: 'Who is this app designed for?',
        a: 'Construction crews, site engineers, surveyors, and field workers who need fast, accurate elevation data on-site. Works equally well for beginners and experienced survey professionals.' },
      { q: 'Can I use the app offline?',
        a: 'Yes. The app is a Progressive Web App (PWA) that works fully offline. All data saves locally on your device and syncs to the cloud automatically when you\'re back online.' },
      { q: 'Which devices are supported?',
        a: 'Any modern iOS or Android device via Chrome, Safari, or Edge. Install it to your home screen for a native app feel — no app store download required.' },
      { q: 'How do I change the language?',
        a: 'Tap EN or ES in the top navigation bar. Your preference is remembered across sessions.' },
    ],
  },
  {
    id: 'points', icon: '📍', color: '#7C3AED', title: 'Points',
    items: [
      { q: 'What is a Point?',
        a: 'A Point is a single rod reading at a specific location. Each point stores the rod reading value, a label (PT1, PT2…), an optional name, and whether it was taken at a benchmark.' },
      { q: 'What does PT mean?',
        a: 'PT stands for Point — a numbered label auto-assigned to each rod reading. Labels increment automatically and can be paired with a custom name for easier identification.' },
      { q: 'How do I create a new point?',
        a: 'Tap the Point tab, enter your rod reading in Ft-In-Fraction or Decimal Feet format, add an optional name, choose the set, and tap Save Point. The point saves instantly.' },
      { q: 'How do I rename a point?',
        a: 'Go to Manage Points, tap the point card to open its details, tap Edit, update the name, and save.' },
      { q: 'How do I delete a point?',
        a: 'Open the point from Manage Points and tap Delete. You can also select multiple points for batch deletion. Deleted points cannot be recovered.' },
      { q: 'How are point numbers generated?',
        a: 'Point numbers (PT1, PT2…) are assigned automatically in sequence. Deleted numbers are not reused — the next point continues from the highest existing number.' },
    ],
  },
  {
    id: 'benchmark', icon: '🎯', color: '#059669', title: 'Benchmark',
    items: [
      { q: 'What is a benchmark?',
        a: 'A benchmark is a known reference elevation point — typically a permanent marker with a verified elevation (e.g. 986.50 ft above sea level). All other survey elevations are calculated relative to it.' },
      { q: 'What is "Reading at a Benchmark / Known Elevation"?',
        a: 'This toggle on the point entry screen tells the app your rod reading was taken at a known elevation point. When set to Yes, you also enter the known elevation. The app uses these two values to compute the Height of Instrument (HI).' },
      { q: 'When should I select Yes?',
        a: 'Select Yes when your rod is held on a benchmark or verified turning point. This is your backsight (BS) reading.\n\nFormula: HI = Known Elevation + BS rod reading.' },
      { q: 'When should I select No?',
        a: 'Select No for all foresight (FS) readings — points whose elevation you\'re calculating.\n\nFormula: Elevation = HI − FS rod reading.' },
      { q: 'How does the benchmark affect calculations?',
        a: 'The benchmark establishes the Height of Instrument: HI = Benchmark Elevation + BS rod. Every foresight thereafter uses Elevation = HI − FS. This chain continues through each instrument setup.' },
      { q: 'How are derived benchmark elevations calculated?',
        a: 'When you move the instrument, take a backsight on the previous turning point (now known) to establish a new HI. The app tracks this elevation chain automatically through all points in the set.' },
    ],
  },
  {
    id: 'rod-reading', icon: '📏', color: '#B45309', title: 'Rod Reading',
    items: [
      { q: 'How do I enter rod readings?',
        a: 'On the Point tab, choose your format — Ft-In-Fraction or Decimal Ft — and enter the value you read off the leveling rod. Ft-In-Fraction uses separate fields for feet, inches, and fraction.' },
      { q: 'Difference between Ft-In-Fraction and Decimal Feet?',
        a: 'Ft-In-Fraction lets you enter readings exactly as marked — e.g. 8′-3½″. Decimal Feet uses a single number like 8.29 ft. Both store the same measurement internally.' },
      { q: 'Which format should I use?',
        a: 'Use Ft-In-Fraction if your rod is marked in feet, inches, and fractions (common on US construction sites). Use Decimal Feet if your rod is marked in tenths and hundredths.' },
      { q: 'Can I switch between formats?',
        a: 'Yes. The toggle at the top of the point entry form switches instantly and converts the current value automatically — no data is lost.' },
    ],
  },
  {
    id: 'sets', icon: '🗂️', color: '#DC2626', title: 'Sets',
    items: [
      { q: 'What is a Set?',
        a: 'A Set is a named group of survey points — like a page in your field book. Points in the same set share an instrument setup or survey run, making it easy to organize and export related readings.' },
      { q: 'Why should I create sets?',
        a: 'Sets keep your survey organized by location, date, or instrument setup. They also enable per-set CSV export and let you review all readings within a single run.' },
      { q: 'Difference between Current Set and New Set?',
        a: '"Current Set" adds the point to your active set. "Create a new set with this point as the first point" starts a fresh group — use this when you move the instrument to a new location.' },
      { q: 'Can I rename a set?',
        a: 'Yes. Open View Sets, tap the set, and use the Edit option to give it a descriptive name like "Sewer Run A" or "Building Pad 3".' },
      { q: 'Can I delete a set?',
        a: 'Yes. In View Sets, use the Delete option. This also removes all points within it. Export the set as CSV first if you need to keep the data.' },
      { q: 'How are sets organized?',
        a: 'Sets appear in View Sets in reverse chronological order (most recent first). Each card shows the set name, creation date, and total point count.' },
    ],
  },
  {
    id: 'compare-height', icon: '⇅', color: '#059669', title: 'Compare Height',
    items: [
      { q: 'How does Compare Height work?',
        a: 'Select a From point and a To point. The app instantly shows the elevation difference, direction (Cut or Fill), and the value in both decimal and Ft-In-Fraction formats.' },
      { q: 'How do I compare two points?',
        a: 'Tap the Compare Height tab, select your reference (From) and comparison (To) points from the dropdowns. The result updates instantly.' },
      { q: 'What does Cut mean?',
        a: 'Cut means the To point is lower than the From point — you need to remove material to reach that elevation. Shown as a negative elevation difference.' },
      { q: 'What does Fill mean?',
        a: 'Fill means the To point is higher than the From point — you need to add material to reach that elevation. Shown as a positive elevation difference.' },
      { q: 'What is elevation difference?',
        a: 'Elevation difference = To elevation − From elevation.\n\n• Positive = Fill (To is higher)\n• Negative = Cut (To is lower)\n\nDisplayed in both decimal feet and Ft-In-Fraction.' },
    ],
  },
  {
    id: 'slope', icon: '📐', color: '#D97706', title: 'Slope',
    items: [
      { q: 'How is slope calculated?',
        a: 'Slope = Rise ÷ Run. Rise is the vertical elevation change between two points. Run is the horizontal distance. The app expresses slope as a percentage, ratio, and decimal.' },
      { q: 'What is percent slope?',
        a: 'Percent slope = (Rise ÷ Run) × 100. A 2% slope means 2 ft of elevation change per 100 ft of horizontal distance. Typical drainage requirements call for a minimum of 1–2% slope.' },
      { q: 'What is ratio slope?',
        a: 'Ratio slope = 1:N — 1 unit of rise for every N units of run.\n\nExample: 1:50 = 2% grade = 1 ft rise per 50 ft of run.' },
      { q: 'What are Rise and Run?',
        a: 'Rise is the vertical elevation change between two points. Run is the horizontal distance between them. Both are required to calculate grade or slope.' },
      { q: 'Common surveying slope examples',
        a: '• Sidewalk drainage: 1–2% (1:100 to 1:50)\n• Parking lots: 1–5%\n• Road grades: 0.5–8%\n• Driveway approach: up to 20%\n• 4:1 cut slope = 25%' },
    ],
  },
  {
    id: 'calculator', icon: '🧮', color: '#0891B2', title: 'Calculator',
    items: [
      { q: 'What calculations are available?',
        a: 'The Calculator tab provides: Ft-In-Fraction ↔ Decimal Feet conversion, elevation calculation from a known HI and rod reading, and common engineering unit conversions. More tools are being added.' },
      { q: 'How do I convert Feet-Inches to Decimal Feet?',
        a: 'Open the Calculator tab and select the Ft-In-Fraction to Decimal converter. Enter feet, inches, and fraction separately — the decimal equivalent appears instantly.' },
      { q: 'How do engineering conversions work?',
        a: 'Select the unit you\'re converting from, enter the value, and select the target unit. Supports feet, inches, millimeters, and meters.' },
    ],
  },
  {
    id: 'view-sets', icon: '📋', color: '#7C3AED', title: 'View Sets',
    items: [
      { q: 'How do I open a set?',
        a: 'Tap the View Sets tab and tap any set card to expand it. You\'ll see all points with their labels, rod readings, and calculated elevations.' },
      { q: 'How do I export a set?',
        a: 'Open a set in View Sets and tap the Export button to download a CSV with all point labels, names, rod readings, and elevations — ready for Excel or Google Sheets.' },
      { q: 'How do I compare sets?',
        a: 'You can compare individual points across sets using the Compare Height tab. Full set-vs-set comparison is planned for a future update.' },
      { q: 'How do I delete a set?',
        a: 'In View Sets, use the Delete option within the set details. All points within the set are also deleted. Export the data first if you need to keep it.' },
    ],
  },
  {
    id: 'data', icon: '☁️', color: '#0284C7', title: 'Data & Sync',
    items: [
      { q: 'Is my data saved automatically?',
        a: 'Yes. Every point saves instantly to local storage on your device. When signed in and online, data also syncs to the cloud in the background after each change.' },
      { q: 'Can I export my work?',
        a: 'Yes. Open any set in View Sets and tap Export to download a CSV with all points and values — ready to open in any spreadsheet application.' },
      { q: 'Will clearing browser data delete my data?',
        a: 'If you\'re signed in with cloud sync, your data is safely stored in the cloud and restores on next sign-in. Without an account, data lives in browser local storage and may be lost if browser data is cleared.' },
      { q: 'Is cloud sync available?',
        a: 'Yes. Create a free account with your email to enable automatic cloud sync. Your data syncs every time you make a change and restores on any device when you sign in.' },
    ],
  },
  {
    id: 'troubleshooting', icon: '🔧', color: '#DC2626', title: 'Troubleshooting',
    items: [
      { q: 'The app is not calculating correctly',
        a: 'Check that your benchmark point has "Reading at a Benchmark" set to Yes with the correct known elevation. All foresight points should have it set to No. Also verify the rod reading format (Ft-In vs Decimal).' },
      { q: 'My benchmark elevation looks wrong',
        a: 'Confirm you\'ve entered the known field elevation of the benchmark marker (e.g. 986.50 ft) separately from the rod reading (e.g. 4.87 ft). These are two distinct values.' },
      { q: 'Points are missing after re-login',
        a: 'Your data restores automatically from the cloud on sign-in. If points are missing, check your internet connection and try signing out and back in. Data from guest sessions is not synced.' },
      { q: 'Export is not working',
        a: 'Ensure your browser allows file downloads. On iOS, tap Share in the download prompt and choose Save to Files. On Android, the file saves to your Downloads folder automatically.' },
      { q: 'The language is not changing',
        a: 'Tap EN or ES in the top navigation bar. If it doesn\'t respond, try refreshing the page. Your language setting is stored locally and persists across sessions.' },
    ],
  },
];

// ── FAQ data (ES) ─────────────────────────────────────────────────────────────
const FAQ_ES: FaqCategory[] = [
  {
    id: 'getting-started', icon: '🚀', color: '#0284C7', title: 'Primeros Pasos',
    items: [
      { q: '¿Qué es la Calculadora de Grado y Elevación?',
        a: 'Una herramienta profesional gratuita para cuadrillas de construcción y topógrafos. Maneja lecturas de mira, verificación de referencias, cálculos de pendiente y seguimiento de elevación — reemplazando los libros de campo en papel para el trabajo diario en obra.' },
      { q: '¿Para quién está diseñada esta aplicación?',
        a: 'Cuadrillas de construcción, ingenieros de sitio, topógrafos y trabajadores de campo que necesitan datos de elevación rápidos y precisos en obra. Funciona igualmente bien para principiantes y topógrafos con experiencia.' },
      { q: '¿Puedo usar la aplicación sin conexión?',
        a: 'Sí. La app es una PWA que funciona completamente sin conexión. Todos los datos se guardan localmente en tu dispositivo y se sincronizan con la nube automáticamente cuando vuelves a conectarte.' },
      { q: '¿Qué dispositivos son compatibles?',
        a: 'Cualquier dispositivo iOS o Android moderno a través de Chrome, Safari o Edge. Puedes instalarla en tu pantalla de inicio para una experiencia como aplicación nativa, sin descarga desde ninguna tienda.' },
      { q: '¿Cómo cambio el idioma?',
        a: 'Toca EN o ES en la barra de navegación superior. Tu preferencia se recuerda entre sesiones.' },
    ],
  },
  {
    id: 'points', icon: '📍', color: '#7C3AED', title: 'Puntos',
    items: [
      { q: '¿Qué es un Punto?',
        a: 'Un Punto es una sola lectura de mira en una ubicación específica. Cada punto almacena el valor de la lectura, una etiqueta (PT1, PT2…), un nombre opcional y si se tomó en un punto de referencia.' },
      { q: '¿Qué significa PT?',
        a: 'PT significa Punto — una etiqueta numerada asignada automáticamente a cada lectura de mira. Las etiquetas se incrementan automáticamente y pueden combinarse con un nombre personalizado.' },
      { q: '¿Cómo creo un nuevo punto?',
        a: 'Toca la pestaña Punto, ingresa tu lectura de mira en formato Pie-Pulg-Fracción o Pies Decimales, agrega un nombre opcional, elige el conjunto y toca Guardar Punto. El punto se guarda instantáneamente.' },
      { q: '¿Cómo renombro un punto?',
        a: 'Ve a Gestionar Puntos, toca la tarjeta del punto, toca Editar, actualiza el nombre y guarda.' },
      { q: '¿Cómo elimino un punto?',
        a: 'Abre el punto desde Gestionar Puntos y toca Eliminar. También puedes seleccionar varios puntos para eliminarlos en lote. Los puntos eliminados no se pueden recuperar.' },
      { q: '¿Cómo se generan los números de punto?',
        a: 'Los números (PT1, PT2…) se asignan automáticamente en secuencia. Los números eliminados no se reutilizan; el siguiente punto continúa desde el número más alto existente.' },
    ],
  },
  {
    id: 'benchmark', icon: '🎯', color: '#059669', title: 'Punto de Referencia',
    items: [
      { q: '¿Qué es un punto de referencia?',
        a: 'Un punto de referencia es una elevación de referencia conocida — típicamente una marca permanente con una elevación verificada (ej. 986.50 pies sobre el nivel del mar). Todas las elevaciones del levantamiento se calculan en relación a él.' },
      { q: '¿Qué es "Lectura en un Punto de Referencia / Elevación Conocida"?',
        a: 'Este interruptor indica que tu lectura de mira fue tomada en un punto de elevación conocida. Al seleccionar Sí, también ingresas el valor de elevación conocida. La app usa estos dos valores para calcular la Altura del Instrumento (HI).' },
      { q: '¿Cuándo debo seleccionar Sí?',
        a: 'Selecciona Sí cuando la mira esté sobre un punto de referencia o punto de giro verificado. Esta es tu lectura de vista atrás (BS).\n\nFórmula: HI = Elevación Conocida + lectura BS.' },
      { q: '¿Cuándo debo seleccionar No?',
        a: 'Selecciona No para todas las lecturas de vista al frente (FS), es decir, puntos cuya elevación estás calculando.\n\nFórmula: Elevación = HI − lectura FS.' },
      { q: '¿Cómo afecta el punto de referencia a los cálculos?',
        a: 'El punto de referencia establece la Altura del Instrumento: HI = Elevación del Punto de Referencia + BS. Cada vista al frente usa Elevación = HI − FS. Esta cadena continúa a través de cada posición del instrumento.' },
      { q: '¿Cómo se calculan las elevaciones derivadas?',
        a: 'Al mover el instrumento, tomas una nueva vista atrás sobre el último punto de giro (ahora conocido) para establecer un nuevo HI. La app rastrea esta cadena de elevaciones automáticamente.' },
    ],
  },
  {
    id: 'rod-reading', icon: '📏', color: '#B45309', title: 'Lectura de Mira',
    items: [
      { q: '¿Cómo ingreso lecturas de mira?',
        a: 'En la pestaña Punto, elige tu formato — Pie-Pulg-Fracción o Pies Decimales — e ingresa el valor que lees en la mira de nivelación. Pie-Pulg-Fracción usa campos separados para mayor precisión.' },
      { q: '¿Diferencia entre Pie-Pulg-Fracción y Pies Decimales?',
        a: 'Pie-Pulg-Fracción permite ingresar lecturas tal como aparecen en la mira, ej. 8′-3½″. Pies Decimales usa un solo número como 8.29 pies. Ambos almacenan la misma medición internamente.' },
      { q: '¿Qué formato debo usar?',
        a: 'Usa Pie-Pulg-Fracción si tu mira está marcada en pies, pulgadas y fracciones (común en obras de EE. UU.). Usa Pies Decimales si tu mira está marcada en décimos y centésimos.' },
      { q: '¿Puedo cambiar entre formatos?',
        a: 'Sí. El interruptor en la parte superior del formulario cambia instantáneamente y convierte el valor actual automáticamente — sin pérdida de datos.' },
    ],
  },
  {
    id: 'sets', icon: '🗂️', color: '#DC2626', title: 'Conjuntos',
    items: [
      { q: '¿Qué es un Conjunto?',
        a: 'Un Conjunto es un grupo de puntos de levantamiento con nombre — como una página de tu libreta de campo. Los puntos del mismo conjunto comparten una posición del instrumento o una corrida de levantamiento.' },
      { q: '¿Por qué debo crear conjuntos?',
        a: 'Los conjuntos mantienen tu levantamiento organizado por ubicación, fecha o posición del instrumento. También permiten exportar por conjunto a CSV.' },
      { q: '¿Diferencia entre Conjunto Actual y Nuevo Conjunto?',
        a: '"Conjunto Actual" agrega el punto a tu conjunto activo. "Crear un nuevo conjunto con este punto como el primero" inicia un grupo nuevo — úsalo cuando muevas el instrumento.' },
      { q: '¿Puedo renombrar un conjunto?',
        a: 'Sí. Abre Ver Conjuntos, toca el conjunto y usa la opción Editar para darle un nombre descriptivo como "Corrida de Alcantarilla A".' },
      { q: '¿Puedo eliminar un conjunto?',
        a: 'Sí. En Ver Conjuntos, usa la opción Eliminar. Esto también elimina todos los puntos dentro de él. Exporta los datos primero si los necesitas.' },
      { q: '¿Cómo están organizados los conjuntos?',
        a: 'Los conjuntos aparecen en Ver Conjuntos en orden cronológico inverso (el más reciente primero). Cada tarjeta muestra el nombre, la fecha de creación y el total de puntos.' },
    ],
  },
  {
    id: 'compare-height', icon: '⇅', color: '#059669', title: 'Comparar Altura',
    items: [
      { q: '¿Cómo funciona Comparar Altura?',
        a: 'Selecciona un punto De y un punto Hasta. La app muestra instantáneamente la diferencia de elevación, la dirección (Corte o Relleno) y el valor en formatos decimal y Pie-Pulg-Fracción.' },
      { q: '¿Cómo comparo dos puntos?',
        a: 'Toca la pestaña Comparar Altura, selecciona tu referencia (De) y tu punto de comparación (Hasta) en los menús desplegables. El resultado se actualiza instantáneamente.' },
      { q: '¿Qué significa Corte?',
        a: 'Corte significa que el punto Hasta es más bajo que el punto De — necesitas retirar material para alcanzar esa elevación. Se muestra como diferencia de elevación negativa.' },
      { q: '¿Qué significa Relleno?',
        a: 'Relleno significa que el punto Hasta es más alto que el punto De — necesitas agregar material para alcanzar esa elevación. Se muestra como diferencia de elevación positiva.' },
      { q: '¿Qué es la diferencia de elevación?',
        a: 'Diferencia de elevación = Elevación Hasta − Elevación De.\n\n• Positivo = Relleno (Hasta es más alto)\n• Negativo = Corte (Hasta es más bajo)\n\nSe muestra en pies decimales y Pie-Pulg-Fracción.' },
    ],
  },
  {
    id: 'slope', icon: '📐', color: '#D97706', title: 'Pendiente',
    items: [
      { q: '¿Cómo se calcula la pendiente?',
        a: 'Pendiente = Elevación ÷ Distancia Horizontal. La elevación es el cambio vertical entre dos puntos. La distancia es la separación horizontal. La app expresa la pendiente como porcentaje, relación y decimal.' },
      { q: '¿Qué es el porcentaje de pendiente?',
        a: 'Porcentaje de pendiente = (Elevación ÷ Distancia) × 100. Una pendiente del 2% significa 2 pies de cambio por cada 100 pies de distancia horizontal. El drenaje típico requiere un mínimo de 1–2%.' },
      { q: '¿Qué es la pendiente de relación?',
        a: 'La pendiente de relación se expresa como 1:N — 1 unidad de elevación por cada N unidades de distancia horizontal.\n\nEjemplo: 1:50 = pendiente del 2% = 1 pie por 50 pies de distancia.' },
      { q: '¿Qué son Elevación y Distancia?',
        a: 'La elevación es el cambio vertical entre dos puntos. La distancia es la separación horizontal. Ambos valores son necesarios para calcular el grado o la pendiente.' },
      { q: 'Ejemplos comunes de pendiente',
        a: '• Drenaje de aceras: 1–2% (1:100 a 1:50)\n• Estacionamientos: 1–5%\n• Grados de carretera: 0.5–8%\n• Entrada de automóviles: hasta 20%\n• Talud de corte 4:1 = 25%' },
    ],
  },
  {
    id: 'calculator', icon: '🧮', color: '#0891B2', title: 'Calculadora',
    items: [
      { q: '¿Qué cálculos están disponibles?',
        a: 'La pestaña Calculadora ofrece: conversión Pie-Pulg-Fracción ↔ Pies Decimales, cálculo de elevación desde un HI conocido y lectura de mira, y conversiones de unidades de ingeniería comunes.' },
      { q: '¿Cómo convierto Pies-Pulgadas a Pies Decimales?',
        a: 'Abre la pestaña Calculadora y selecciona el convertidor Pie-Pulg-Fracción a Decimal. Ingresa pies, pulgadas y fracción por separado — el equivalente decimal aparece instantáneamente.' },
      { q: '¿Cómo funcionan las conversiones de ingeniería?',
        a: 'Selecciona la unidad de origen, ingresa el valor y selecciona la unidad de destino. Compatible con pies, pulgadas, milímetros y metros.' },
    ],
  },
  {
    id: 'view-sets', icon: '📋', color: '#7C3AED', title: 'Ver Conjuntos',
    items: [
      { q: '¿Cómo abro un conjunto?',
        a: 'Toca la pestaña Ver Conjuntos y toca cualquier tarjeta de conjunto para expandirla. Verás todos los puntos con sus etiquetas, lecturas de mira y elevaciones calculadas.' },
      { q: '¿Cómo exporto un conjunto?',
        a: 'Abre un conjunto en Ver Conjuntos y toca Exportar. Esto descarga un archivo CSV con todos los datos, listo para Excel o Google Sheets.' },
      { q: '¿Cómo comparo conjuntos?',
        a: 'Puedes comparar puntos individuales entre conjuntos usando la pestaña Comparar Altura. La comparación completa de conjuntos está prevista para una actualización futura.' },
      { q: '¿Cómo elimino un conjunto?',
        a: 'En Ver Conjuntos, usa la opción Eliminar dentro de los detalles del conjunto. Todos los puntos dentro también se eliminan. Exporta los datos primero si los necesitas.' },
    ],
  },
  {
    id: 'data', icon: '☁️', color: '#0284C7', title: 'Datos y Sincronización',
    items: [
      { q: '¿Se guardan mis datos automáticamente?',
        a: 'Sí. Cada punto se guarda instantáneamente en el almacenamiento local de tu dispositivo. Cuando estás conectado a internet, los datos también se sincronizan con la nube en segundo plano.' },
      { q: '¿Puedo exportar mi trabajo?',
        a: 'Sí. Abre cualquier conjunto en Ver Conjuntos y toca Exportar para descargar un CSV con todos los puntos y valores, listo para cualquier aplicación de hojas de cálculo.' },
      { q: '¿Borrar los datos del navegador elimina mis datos?',
        a: 'Si tienes la sincronización en la nube habilitada, tus datos están seguros en la nube y se restauran al iniciar sesión nuevamente. Sin cuenta, los datos viven en el almacenamiento local del navegador.' },
      { q: '¿Está disponible la sincronización en la nube?',
        a: 'Sí. Crea una cuenta gratuita con tu correo electrónico para habilitar la sincronización automática. Tus datos se sincronizan con cada cambio y se restauran en cualquier dispositivo al iniciar sesión.' },
    ],
  },
  {
    id: 'troubleshooting', icon: '🔧', color: '#DC2626', title: 'Solución de Problemas',
    items: [
      { q: 'La aplicación no calcula correctamente',
        a: 'Verifica que tu punto de referencia tenga "Lectura en un Punto de Referencia" en Sí con la elevación conocida correcta. Todos los puntos de vista al frente deben tener esta opción en No. También verifica el formato de lectura de mira.' },
      { q: 'Mi elevación de referencia parece incorrecta',
        a: 'Confirma que hayas ingresado la elevación de campo conocida del punto de referencia (ej. 986.50 pies) por separado de la lectura de mira (ej. 4.87 pies). Son dos valores distintos.' },
      { q: 'Los puntos faltan después de volver a iniciar sesión',
        a: 'Tus datos se restauran automáticamente desde la nube al iniciar sesión. Si faltan puntos, verifica tu conexión a internet e intenta cerrar y volver a iniciar sesión.' },
      { q: 'La exportación no funciona',
        a: 'Asegúrate de que tu navegador permita descargas. En iOS, toca Compartir en el diálogo de descarga y elige Guardar en Archivos. En Android, el archivo se guarda en tu carpeta de Descargas automáticamente.' },
      { q: 'El idioma no cambia',
        a: 'Toca EN o ES en la barra de navegación superior. Si no responde, intenta actualizar la página. Tu configuración de idioma se guarda localmente y persiste entre sesiones.' },
    ],
  },
];

const FAQ_DATA: Record<string, FaqCategory[]> = { en: FAQ_EN, es: FAQ_ES };

// ── Video category metadata ───────────────────────────────────────────────────
const CAT_COLORS: Record<string, string> = {
  'getting-started': '#0284C7', 'survey-points': '#7C3AED',
  'compare-height': '#059669',  'slope': '#D97706',
  'view-sets': '#DC2626',       'calculator': '#0891B2',
};
const CAT_ICONS: Record<string, string> = {
  'getting-started': '🚀', 'survey-points': '📍',
  'compare-height': '⇅',  'slope': '📐',
  'view-sets': '🗂',       'calculator': '🧮',
};
const FEATURED_YOUTUBE_ID = 'jNQXAC9IVRw';

// ── Highlight helper ──────────────────────────────────────────────────────────
function escapeRx(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function HL({ text, q }: { text: string; q: string }) {
  if (!q.trim()) return <>{text}</>;
  const parts = text.split(new RegExp(`(${escapeRx(q.trim())})`, 'gi'));
  return (
    <>
      {parts.map((p, i) =>
        p.toLowerCase() === q.trim().toLowerCase()
          ? <mark key={i} style={{ backgroundColor: '#FEF08A', borderRadius: 2, padding: '0 1px', fontWeight: 800 }}>{p}</mark>
          : <React.Fragment key={i}>{p}</React.Fragment>
      )}
    </>
  );
}

// ── Chevron icon (animates ► → ↓) ────────────────────────────────────────────
function Chevron({ open, color = TEXT_MID }: { open: boolean; color?: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
         stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
         aria-hidden="true"
         style={{
           flexShrink: 0,
           transform: open ? 'rotate(0deg)' : 'rotate(-90deg)',
           transition: 'transform 0.28s cubic-bezier(0.4, 0, 0.2, 1)',
         }}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function TutorialScreen() {
  const { t, lang } = useLang();
  const ui = UI[lang] ?? UI.en;
  const faqCategories = FAQ_DATA[lang] ?? FAQ_DATA.en;

  const [activeSubTab,     setActiveSubTab]     = useState<'faq' | 'videos'>('faq');
  const [faqSearch,        setFaqSearch]         = useState('');
  const [vidSearch,        setVidSearch]         = useState('');
  const [openFaqCats,      setOpenFaqCats]       = useState<Set<string>>(new Set(['getting-started']));
  const [openFaqItems,     setOpenFaqItems]      = useState<Set<string>>(new Set());
  const [expandedVid,      setExpandedVid]       = useState<string | null>('getting-started');
  const [faqFocused,       setFaqFocused]        = useState(false);
  const [vidFocused,       setVidFocused]        = useState(false);

  const toggleFaqCat = (id: string) =>
    setOpenFaqCats(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const toggleFaqItem = (key: string) =>
    setOpenFaqItems(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });

  // Video categories (localised)
  const CATEGORIES = useMemo(() => [
    { id: 'getting-started', title: t('tutCatGettingStarted'), videos: [
        { title: t('tutGS1Title'), description: t('tutGS1Desc'), youtubeId: null },
        { title: t('tutGS2Title'), description: t('tutGS2Desc'), youtubeId: null },
      ] },
    { id: 'survey-points', title: t('tutCatSurveyPoints'), videos: [
        { title: t('tutSP1Title'), description: t('tutSP1Desc'), youtubeId: null },
        { title: t('tutSP2Title'), description: t('tutSP2Desc'), youtubeId: null },
        { title: t('tutSP3Title'), description: t('tutSP3Desc'), youtubeId: null },
      ] },
    { id: 'compare-height', title: t('tutCatCompareHeight'), videos: [
        { title: t('tutCH1Title'), description: t('tutCH1Desc'), youtubeId: null },
        { title: t('tutCH2Title'), description: t('tutCH2Desc'), youtubeId: null },
        { title: t('tutCH3Title'), description: t('tutCH3Desc'), youtubeId: null },
      ] },
    { id: 'slope', title: t('tutCatSlope'), videos: [
        { title: t('tutSL1Title'), description: t('tutSL1Desc'), youtubeId: null },
        { title: t('tutSL2Title'), description: t('tutSL2Desc'), youtubeId: null },
      ] },
    { id: 'view-sets', title: t('tutCatViewSets'), videos: [
        { title: t('tutVS1Title'), description: t('tutVS1Desc'), youtubeId: null },
        { title: t('tutVS2Title'), description: t('tutVS2Desc'), youtubeId: null },
        { title: t('tutVS3Title'), description: t('tutVS3Desc'), youtubeId: null },
      ] },
    { id: 'calculator', title: t('tutCatCalculator'), videos: [
        { title: t('tutCA1Title'), description: t('tutCA1Desc'), youtubeId: null },
        { title: t('tutCA2Title'), description: t('tutCA2Desc'), youtubeId: null },
      ] },
  ], [t]);

  // FAQ search
  const faqQ = faqSearch.trim().toLowerCase();
  const filteredFaq = useMemo(() => {
    if (!faqQ) return faqCategories;
    return faqCategories.map(cat => {
      const catHit  = cat.title.toLowerCase().includes(faqQ);
      const hitItems = cat.items.filter(
        item => item.q.toLowerCase().includes(faqQ) || item.a.toLowerCase().includes(faqQ),
      );
      if (catHit)          return { ...cat };
      if (hitItems.length) return { ...cat, items: hitItems };
      return null;
    }).filter(Boolean) as FaqCategory[];
  }, [faqQ, faqCategories]);

  const totalFaqResults = useMemo(
    () => faqQ ? filteredFaq.reduce((s, c) => s + c.items.length, 0) : 0,
    [faqQ, filteredFaq],
  );

  // Video search
  const vidQ = vidSearch.trim().toLowerCase();
  const filteredVids = useMemo(() => {
    if (!vidQ) return CATEGORIES;
    return CATEGORIES.map(cat => {
      const catHit    = cat.title.toLowerCase().includes(vidQ);
      const hitVideos = cat.videos.filter(
        v => v.title.toLowerCase().includes(vidQ) || v.description.toLowerCase().includes(vidQ),
      );
      if (catHit)           return { ...cat };
      if (hitVideos.length) return { ...cat, videos: hitVideos };
      return null;
    }).filter(Boolean) as typeof CATEGORIES;
  }, [vidQ, CATEGORIES]);

  const totalVidResults = useMemo(
    () => vidQ ? filteredVids.reduce((s, c) => s + c.videos.length, 0) : 0,
    [vidQ, filteredVids],
  );

  const faqEmpty = faqQ.length > 0 && filteredFaq.length === 0;
  const vidEmpty = vidQ.length > 0 && filteredVids.length === 0;

  const searchFocused  = activeSubTab === 'faq' ? faqFocused : vidFocused;
  const currentSearch  = activeSubTab === 'faq' ? faqSearch : vidSearch;
  const setCurrentSearch = (v: string) => activeSubTab === 'faq' ? setFaqSearch(v) : setVidSearch(v);
  const setCurrentFocused = (v: boolean) => activeSubTab === 'faq' ? setFaqFocused(v) : setVidFocused(v);

  return (
    <div style={s.root}>
      <style>{`
        .hc-input {
          border: none !important;
          outline: none !important;
          box-shadow: none !important;
          -webkit-box-shadow: none !important;
          -webkit-appearance: none !important;
          appearance: none !important;
          background: transparent !important;
          -webkit-tap-highlight-color: transparent !important;
          tap-highlight-color: transparent !important;
        }
        .hc-input:focus,
        .hc-input:focus-visible {
          outline: none !important;
          box-shadow: none !important;
          -webkit-box-shadow: none !important;
          background: transparent !important;
          border: none !important;
        }
        .hc-input::placeholder { color: #9CA3AF; }
        .hc-btn:focus-visible {
          outline: 2px solid #3B82F6;
          outline-offset: 2px;
          border-radius: 10px;
        }
      `}</style>

      {/* ── Header card (segmented + search) — outside scroll ────── */}
      <div style={s.headerOuter}>
        <div style={s.headerCard}>

          {/* Segmented control */}
          <div style={s.segmented} role="tablist" aria-label="Help Center sections">
            {(['faq', 'videos'] as const).map(tab => (
              <button
                key={tab}
                role="tab"
                aria-selected={activeSubTab === tab}
                className="hc-btn"
                style={{ ...s.segBtn, ...(activeSubTab === tab ? s.segBtnActive : {}) }}
                onClick={() => setActiveSubTab(tab)}
              >
                {tab === 'faq'
                  ? (typeof ui.faqTab === 'string' ? ui.faqTab : 'FAQ')
                  : (typeof ui.vidTab === 'string' ? ui.vidTab : 'Tutorial Videos')}
              </button>
            ))}
          </div>

          {/* Search */}
          <div style={{
            ...s.searchBox,
            borderColor: searchFocused ? BLUE_ACC : BORDER,
            boxShadow:   searchFocused ? `0 0 0 3px ${BLUE_ACC}28` : '0 1px 4px rgba(0,0,0,0.06)',
          }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none"
                 stroke={TEXT_MID} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
                 aria-hidden="true" style={{ flexShrink: 0 }}>
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              type="text"
              className="hc-input"
              value={currentSearch}
              onChange={e => setCurrentSearch(e.target.value)}
              onFocus={() => setCurrentFocused(true)}
              onBlur={() => setCurrentFocused(false)}
              placeholder={typeof ui.faqPlaceholder === 'string'
                ? (activeSubTab === 'faq' ? ui.faqPlaceholder as string : ui.vidPlaceholder as string)
                : ''}
              style={s.searchInput}
              autoComplete="off"
              enterKeyHint="search"
              aria-label={activeSubTab === 'faq' ? 'Search FAQs' : 'Search tutorial videos'}
            />
            {currentSearch.length > 0 && (
              <button
                onClick={() => setCurrentSearch('')}
                className="hc-btn"
                aria-label="Clear search"
                style={s.clearBtn}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                     stroke={TEXT_MID} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            )}
          </div>

          {/* Result count */}
          {((activeSubTab === 'faq' && faqQ && !faqEmpty) ||
            (activeSubTab === 'videos' && vidQ && !vidEmpty)) && (
            <div style={s.resultCount}>
              {typeof ui.resultFound === 'function'
                ? ui.resultFound(activeSubTab === 'faq' ? totalFaqResults : totalVidResults)
                : ''}
            </div>
          )}
        </div>
      </div>

      {/* ── Scroll area ───────────────────────────────────────────── */}
      <div style={s.scrollArea} role="tabpanel">

        {/* ══════ FAQ TAB ══════ */}
        {activeSubTab === 'faq' && (
          faqEmpty
            ? <EmptyState
                label={typeof ui.noFaqLabel === 'string' ? ui.noFaqLabel : ''}
                hint={typeof ui.noFaqHint === 'string' ? ui.noFaqHint : ''}
              />
            : <div style={s.list}>
                {filteredFaq.map(cat => {
                  const catOpen = faqQ.length > 0 || openFaqCats.has(cat.id);
                  const contentId = `faq-cat-${cat.id}`;
                  return (
                    <div key={cat.id} style={s.catCard}>

                      {/* Category header */}
                      <button
                        id={`${contentId}-btn`}
                        aria-expanded={catOpen}
                        aria-controls={contentId}
                        className="hc-btn"
                        style={{
                          ...s.catHeader,
                          borderBottom: catOpen ? `1px solid ${BORDER}` : 'none',
                        }}
                        onClick={() => faqQ.length === 0 && toggleFaqCat(cat.id)}
                      >
                        <div style={s.catLeft}>
                          <div style={{ ...s.catIconBox, backgroundColor: cat.color + '1A', border: `1.5px solid ${cat.color}44` }}>
                            <span style={{ fontSize: 20 }}>{cat.icon}</span>
                          </div>
                          <div>
                            <div style={s.catTitle}><HL text={cat.title} q={faqQ} /></div>
                            <div style={s.catMeta}>{cat.items.length} {lang === 'es' ? 'preguntas' : 'questions'}</div>
                          </div>
                        </div>
                        {faqQ.length === 0 && <Chevron open={catOpen} />}
                      </button>

                      {/* Category content */}
                      <div
                        id={contentId}
                        role="region"
                        aria-labelledby={`${contentId}-btn`}
                        style={{
                          maxHeight: catOpen ? 12000 : 0,
                          opacity:   catOpen ? 1 : 0,
                          overflow: 'hidden',
                          transition: 'max-height 0.32s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.25s ease',
                        }}
                      >
                        {cat.items.map((item, idx) => {
                          const itemKey = `${cat.id}-${idx}`;
                          const itemOpen = faqQ.length > 0 || openFaqItems.has(itemKey);
                          const answerId = `faq-ans-${itemKey}`;
                          return (
                            <div
                              key={itemKey}
                              style={{
                                borderBottom: idx < cat.items.length - 1 ? `1px solid ${BORDER}` : 'none',
                              }}
                            >
                              {/* Question */}
                              <button
                                aria-expanded={itemOpen}
                                aria-controls={answerId}
                                className="hc-btn"
                                style={s.faqQ}
                                onClick={() => toggleFaqItem(itemKey)}
                              >
                                <span style={s.faqQText}><HL text={item.q} q={faqQ} /></span>
                                <Chevron open={itemOpen} color={itemOpen ? NAVY : TEXT_MID} />
                              </button>

                              {/* Answer */}
                              <div
                                id={answerId}
                                style={{
                                  maxHeight: itemOpen ? 2000 : 0,
                                  opacity:   itemOpen ? 1 : 0,
                                  overflow: 'hidden',
                                  transition: 'max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.22s ease',
                                }}
                              >
                                <div style={s.faqA}>
                                  {item.a.split('\n').map((line, li, arr) => (
                                    <span key={li}>
                                      <HL text={line} q={faqQ} />
                                      {li < arr.length - 1 && <br />}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
        )}

        {/* ══════ TUTORIAL VIDEOS TAB ══════ */}
        {activeSubTab === 'videos' && (
          vidEmpty
            ? <EmptyState
                label={typeof ui.noVidLabel === 'string' ? ui.noVidLabel : ''}
                hint={typeof ui.noVidHint === 'string' ? ui.noVidHint : ''}
              />
            : <>
                {/* Featured video — only when not searching */}
                {!vidQ && (
                  <>
                    <div style={s.sectionLabel}>{t('tutFeaturedVideo')}</div>
                    <div style={s.featCard}>
                      <div style={s.videoEmbed}>
                        <iframe
                          src={`https://www.youtube.com/embed/${FEATURED_YOUTUBE_ID}?rel=0&modestbranding=1`}
                          title={t('tutFeaturedTitle')}
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                          style={s.videoIframe}
                        />
                      </div>
                      <div style={s.featMeta}>
                        <div style={s.featTitle}>{t('tutFeaturedTitle')}</div>
                        <div style={s.featDesc}>{t('tutFeaturedDesc')}</div>
                      </div>
                    </div>
                  </>
                )}

                <div style={s.sectionLabel}>{t('tutTutorialVideos')}</div>
                <div style={s.list}>
                  {filteredVids.map(cat => {
                    const isOpen = expandedVid === cat.id || vidQ.length > 0;
                    const color  = CAT_COLORS[cat.id] ?? '#0284C7';
                    const icon   = CAT_ICONS[cat.id]  ?? '📋';
                    const cid    = `vid-cat-${cat.id}`;
                    return (
                      <div key={cat.id} style={s.catCard}>
                        <button
                          id={`${cid}-btn`}
                          aria-expanded={isOpen}
                          aria-controls={cid}
                          className="hc-btn"
                          style={{
                            ...s.catHeader,
                            borderBottom: isOpen ? `1px solid ${BORDER}` : 'none',
                          }}
                          onClick={() => !vidQ && setExpandedVid(isOpen ? null : cat.id)}
                        >
                          <div style={s.catLeft}>
                            <div style={{ ...s.catIconBox, backgroundColor: color + '1A', border: `1.5px solid ${color}44` }}>
                              <span style={{ fontSize: 20 }}>{icon}</span>
                            </div>
                            <div>
                              <div style={s.catTitle}><HL text={cat.title} q={vidQ} /></div>
                              <div style={s.catMeta}>{strings[lang].tutCount(cat.videos.length)}</div>
                            </div>
                          </div>
                          {!vidQ && <Chevron open={isOpen} />}
                        </button>

                        <div
                          id={cid}
                          role="region"
                          aria-labelledby={`${cid}-btn`}
                          style={{
                            maxHeight: isOpen ? 4000 : 0,
                            opacity:   isOpen ? 1 : 0,
                            overflow: 'hidden',
                            transition: 'max-height 0.32s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.25s ease',
                          }}
                        >
                          <div style={s.videoList}>
                            {cat.videos.map((vid, i) => (
                              <div key={i} style={{
                                ...s.videoRow,
                                borderBottom: i < cat.videos.length - 1 ? `1px solid ${BORDER}` : 'none',
                              }}>
                                <div>
                                  <div style={s.comingSoon}>
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                                         stroke="currentColor" strokeWidth="2.5"
                                         strokeLinecap="round" strokeLinejoin="round">
                                      <polygon points="5 3 19 12 5 21 5 3"/>
                                    </svg>
                                    <span>{t('tutComingSoon')}</span>
                                  </div>
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={s.vidTitle}><HL text={vid.title} q={vidQ} /></div>
                                  <div style={s.vidDesc}><HL text={vid.description} q={vidQ} /></div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
        )}

        {/* Footer */}
        <div style={s.footer}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true"
               stroke={TEXT_MID} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <span>{typeof ui.footerNote === 'string' ? ui.footerNote : ''}</span>
        </div>
        <div style={{ height: 28 }} />
      </div>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────
function EmptyState({ label, hint }: { label: string; hint: string }) {
  return (
    <div style={s.emptyCard} role="status">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none"
           stroke={TEXT_MID} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"
           aria-hidden="true" style={{ marginBottom: 14, opacity: 0.45 }}>
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        <line x1="8" y1="11" x2="14" y2="11"/>
      </svg>
      <div style={s.emptyLabel}>{label}</div>
      <div style={s.emptyHint}>{hint}</div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {

  root: {
    display: 'flex', flexDirection: 'column', flex: 1,
    overflow: 'hidden', backgroundColor: SURFACE,
  },

  /* Header */
  headerOuter: {
    padding: '10px 12px 8px', backgroundColor: SURFACE, flexShrink: 0,
  },
  headerCard: {
    backgroundColor: CARD, borderRadius: 18,
    border: `1px solid ${BLUE_ACC}33`,
    boxShadow: '0 2px 12px rgba(20,58,99,0.10)',
    padding: '10px 12px',
    display: 'flex', flexDirection: 'column', gap: 8,
  },

  /* Segmented control */
  segmented: {
    display: 'flex', borderRadius: 13, backgroundColor: '#EEF2F7',
    padding: 3, gap: 0,
  },
  segBtn: {
    flex: 1, padding: '10px 8px',
    fontSize: '15px', fontWeight: 600, letterSpacing: '0.01em',
    color: TEXT_MID, backgroundColor: 'transparent',
    border: 'none', borderRadius: 11,
    cursor: 'pointer',
    transition: 'background 0.2s cubic-bezier(0.4,0,0.2,1), color 0.2s, box-shadow 0.2s',
  },
  segBtnActive: {
    color: '#FFFFFF', backgroundColor: NAVY,
    fontWeight: 700, boxShadow: '0 2px 10px rgba(20,58,99,0.28)',
  },

  /* Search */
  searchBox: {
    display: 'flex', alignItems: 'center', gap: 8,
    backgroundColor: '#F3F4F6', borderRadius: 13,
    padding: '10px 12px',
    border: '1.5px solid transparent',
    transition: 'border-color 0.18s ease, box-shadow 0.18s ease',
  },
  searchInput: {
    flex: 1, fontSize: 16, fontWeight: 500, color: TEXT_PRI, minWidth: 0,
  },
  clearBtn: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'none', border: 'none', padding: 2, cursor: 'pointer', flexShrink: 0,
    minWidth: 28, minHeight: 28,
  },

  /* Result count */
  resultCount: {
    fontSize: 13, fontWeight: 700, color: BLUE_ACC,
    textAlign: 'center', letterSpacing: '0.01em',
  },

  /* Scroll area */
  scrollArea: {
    flex: 1, overflowY: 'auto', padding: '12px 12px 0',
    WebkitOverflowScrolling: 'touch',
  },

  /* Card list */
  list: {
    display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16,
  },

  /* Category card */
  catCard: {
    backgroundColor: CARD, borderRadius: 16, overflow: 'hidden',
    border: `1px solid ${BORDER}`,
    boxShadow: '0 2px 10px rgba(0,0,0,0.07)',
  },
  catHeader: {
    width: '100%', display: 'flex', alignItems: 'center',
    justifyContent: 'space-between', padding: '14px 16px',
    backgroundColor: 'transparent', border: 'none',
    cursor: 'pointer', textAlign: 'left', gap: 10,
    minHeight: 56,
  },
  catLeft: {
    display: 'flex', alignItems: 'center', gap: 13, flex: 1, minWidth: 0,
  },
  catIconBox: {
    width: 44, height: 44, borderRadius: 12,
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  catTitle: {
    fontSize: 18, fontWeight: 700, color: TEXT_PRI, lineHeight: 1.25,
  },
  catMeta: {
    fontSize: 15, fontWeight: 500, color: TEXT_MID, marginTop: 2,
  },

  /* FAQ question row */
  faqQ: {
    width: '100%', display: 'flex', alignItems: 'center',
    justifyContent: 'space-between', gap: 12,
    padding: '14px 16px', backgroundColor: 'transparent',
    border: 'none', cursor: 'pointer', textAlign: 'left',
    minHeight: 52,
  },
  faqQText: {
    fontSize: 17, fontWeight: 600, color: TEXT_PRI, lineHeight: 1.45, flex: 1,
  },

  /* FAQ answer */
  faqA: {
    padding: '10px 16px 16px 16px',
    fontSize: 16, fontWeight: 400, color: TEXT_SEC,
    lineHeight: 1.7, borderTop: `1px solid ${BORDER}`,
  },

  /* Section label */
  sectionLabel: {
    fontSize: 15, fontWeight: 800, color: TEXT_PRI,
    letterSpacing: 0.1, marginBottom: 10, paddingLeft: 2,
  },

  /* Featured video */
  featCard: {
    backgroundColor: CARD, borderRadius: 16, overflow: 'hidden',
    marginBottom: 18, boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
    border: `1px solid ${BORDER}`,
  },
  videoEmbed: {
    position: 'relative', width: '100%', paddingBottom: '56.25%',
    backgroundColor: '#000', overflow: 'hidden',
  },
  videoIframe: {
    position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none',
  },
  featMeta:  { padding: '14px 16px 16px' },
  featTitle: { fontSize: 17, fontWeight: 800, color: TEXT_PRI, marginBottom: 5, lineHeight: 1.35 },
  featDesc:  { fontSize: 15, fontWeight: 400, color: TEXT_SEC, lineHeight: 1.6 },

  /* Video list */
  videoList: { padding: '0 16px' },
  videoRow: {
    display: 'flex', alignItems: 'flex-start', gap: 12, padding: '13px 0',
  },
  comingSoon: {
    display: 'flex', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.22)',
    borderRadius: 7, padding: '4px 8px',
    fontSize: 12, fontWeight: 700, color: BLUE_ACC, whiteSpace: 'nowrap',
    marginTop: 1,
  },
  vidTitle: { fontSize: 15, fontWeight: 700, color: TEXT_PRI, marginBottom: 3, lineHeight: 1.35 },
  vidDesc:  { fontSize: 14, fontWeight: 400, color: TEXT_SEC, lineHeight: 1.55 },

  /* Empty state */
  emptyCard: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', backgroundColor: CARD,
    borderRadius: 16, padding: '40px 28px', marginBottom: 16,
    border: `1px solid ${BORDER}`, boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
    textAlign: 'center',
  },
  emptyLabel: { fontSize: 17, fontWeight: 800, color: TEXT_PRI, marginBottom: 7 },
  emptyHint:  { fontSize: 15, fontWeight: 400, color: TEXT_MID, lineHeight: 1.55 },

  /* Footer */
  footer: {
    display: 'flex', alignItems: 'flex-start', gap: 6,
    padding: '8px 2px', fontSize: 12, fontWeight: 500,
    color: TEXT_MID, lineHeight: 1.5, marginTop: 4,
  },
};
