/* ══════════════════════════════════════════════════════════
   CARTA ORIGINAL de Bamba — la usan la web (index.html) y el panel.
   El dueño la cambia desde el panel (pestaña Carta): lo que guarda
   ahí le gana a esto. Esto queda como carta "original" y como
   respaldo si el sistema no responde.
   ══════════════════════════════════════════════════════════ */
/* sacable: la ficha deja sacar ingredientes (el precio no cambia).
   personalizable:false (en la sección o en el plato): ni sacar ni agregar nada, aunque tenga `ing`.
   porcionable: las pizzas de la sección se pueden vender por porción. Cuáles sí y a qué precio lo
   decide el dueño en el panel (pestaña Carta); las variantes "Por porción" de acá son el valor por
   defecto si el sistema no responde. */
/* La web es para pedir take away o delivery: no va nada que solo se sirve en el local
   (café, cervezas tiradas, tragos, copas de vino). */
window.BAMBA_MENU = [
  { id:'mas-alla', sacable:true, title:'MÁS ALLÁ DE LA PIZZA', color:'azul', items:[
    { id:'faina', name:'Faina', price:2000 },
    { id:'fritelle', name:'Fritelle', price:9000, desc:'Trozos de masa frita con pesto.' },
    { id:'olive', name:'Olive ascolane', price:9000, desc:'Aceitunas rellenas y rebozadas. 2 dips.' },
    { id:'panuozzo', ingVariante:true, name:'Panuozzo (sándwich)', price:14000, desc:'Elegí tu relleno.', variantLabel:'Relleno',
      variants:[{name:'Mortadella, stracciatella, pesto, pistacchio',price:14000},{name:'Crudo, stracciatella, rúcula, pesto',price:14000}] },
  ]},
  { id:'empanadas', personalizable:false, title:'EMPANADAS', color:'rojo', items:[
    { id:'e-carne', name:'Carne', price:3500, variantLabel:'Cocción', variants:[{name:'Horneada',price:3500},{name:'Frita',price:3500}] },
    { id:'e-jamonqueso', name:'Jamón y queso', price:3500, variantLabel:'Cocción', variants:[{name:'Horneada',price:3500},{name:'Frita',price:3500}] },
    { id:'e-pollo', name:'Pollo', price:3500 },
    { id:'e-mortapesto', ing:['Mortadella','Queso','Pesto'], name:'Mortadella, queso y pesto', price:3500, variantLabel:'Cocción', variants:[{name:'Horneada',price:3500},{name:'Frita',price:3500}] },
    { id:'e-capresse', name:'Capresse', price:3500 },
    { id:'e-roquefort', name:'Roquefort', price:3500 },
    { id:'e-humita', name:'Humita', price:3500 },
    { id:'e-cebollaqueso', name:'Cebolla y queso', price:3500 },
    { id:'e-verdura', name:'Verdura', price:3500 },
  ]},
  { id:'napolitana', sacable:true, title:'BAMBA NAPOLITANA', badge:'ESTILO TANO', color:'rojo', items:[
    { id:'margherita', ing:['Pomodoro','Fior di latte','Albahaca'], name:'Margherita', price:18500, desc:'Pomodoro, fior di latte, albahaca.' },
    { id:'mortazza', ing:['Fior di latte','Mortadella','Stracciatella','Pesto','Pistacchio'], name:'Mortazza', price:24000, desc:'Fior di latte, mortadella, stracciatella, pesto, pistacchio.' },
    { id:'cinqueformaggi', ing:['Fior di latte','Parmesano','Roquefort','Provolone','Bocconcini'], name:'Cinque formaggi', price:25000, desc:'Fior di latte, parmesano, roquefort, provolone, bocconcini.',
      variantLabel:'Miel', variants:[{name:'Sin miel',price:25000},{name:'Con miel',price:25000}] },
    { id:'magica', ing:['Pomodoro','Fior di latte','Cherrys','Rúcula','Crudo','Burrata','Pesto'], name:'Mágica', price:28000, desc:'Pomodoro, fior di latte, cherrys, rúcula, crudo, burrata, pesto.' },
    { id:'funghi', ing:['Pomodoro','Fior di latte','Champiñones','Albahaca'], name:'Funghi', price:22000, desc:'Pomodoro, fior di latte, champiñones, albahaca.' },
    { id:'melanzane', ing:['Pomodoro','Fior di latte','Berenjenas','Parmesano'], name:'Melanzane', price:24000, desc:'Pomodoro, fior di latte, berenjenas, parmesano.' },
    { id:'patate', ing:['Fior di latte','Papas','Romero','Pimienta','Parmesano'], name:'Patate', price:21000, desc:'Fior di latte, papas, romero, pimienta, parmesano.' },
    { id:'bamba', ing:['Fior di latte','Roquefort','Brie','Nueces','Miel'], name:'Bamba', price:26000, desc:'Fior di latte, roquefort, brie, nueces, miel.' },
  ]},
  { id:'al-molde', sacable:true, porcionable:true, title:'BAMBA AL MOLDE', badge:'ESTILO ARGENTO', color:'azul', items:[
    { id:'muzzarella', mitad:true, name:'Muzzarella', price:22000, variantLabel:'Presentación', variants:[{name:'Pizza entera',price:22000},{name:'Por porción',price:3500}] },
    { id:'jamonmorron', mitad:true, name:'Jamón y morrón', price:30500, variantLabel:'Presentación', variants:[{name:'Pizza entera',price:30500},{name:'Por porción',price:4500}] },
    { id:'napolitanaam', mitad:true, name:'Napolitana', price:29500, variantLabel:'Presentación', variants:[{name:'Pizza entera',price:29500},{name:'Por porción',price:4500}] },
    { id:'provolone', mitad:true, name:'Provolone', price:32500 },
    { id:'calabresa', mitad:true, name:'Calabresa', price:30000 },
    { id:'cuatroquesos', name:'Cuatro quesos', price:35000 },
    { id:'primavera', ing:['Jamón','Muzzarella','Huevo'], name:'Primavera', price:26000, desc:'Jamón, muzzarella, huevo.' },
    { id:'anchoas', mitad:true, name:'Anchoas', price:22000 },
    { id:'fugazza', name:'Fugazza', price:20800 },
    { id:'fugazzaqueso', name:'Fugazza con queso', price:23000 },
    { id:'fugazzetarellena', name:'Fugazzeta rellena', price:38500 },
    { id:'fugazzetajamon', name:'Fugazzeta rellena con jamón', price:41000, variantLabel:'Presentación', variants:[{name:'Pizza entera',price:41000},{name:'Por porción',price:6000}] },
  ]},
  { id:'mitad', title:'ARMÁ TU MITAD Y MITAD', color:'rojo', especial:'mitad', items:[] },
  { id:'dolci', title:'DOLCI DELLA CASA', color:'azul', items:[
    { id:'vigilante', name:'Vigilante', price:7000, variantLabel:'Elegí', variants:[{name:'Batata',price:7000},{name:'Membrillo',price:7000}] },
    { id:'flan', name:'Flan', price:10000, variantLabel:'Elegí', variants:[{name:'Con crema',price:10000},{name:'Con dulce de leche',price:10000},{name:'Mixto',price:10000}] },
    { id:'pizzapistacchio', ing:['Azúcar impalpable','Pistachos'], name:'Pizza con pistacchio', price:15000, desc:'Azúcar impalpable, lluvia de pistachos.' },
    { id:'pizzanutella', ing:['Azúcar impalpable','Nueces'], name:'Pizza con nutella', price:15000, desc:'Azúcar impalpable, nueces.' },
  ]},
  { id:'cervezas', title:'CERVEZAS', color:'rojo', items:[
    { id:'quilmesstout', name:'Quilmes Stout', price:7500, desc:'1 litro.' },
    { id:'amber', name:'Amber', price:7000, desc:'473 cc.' },
    { id:'corona', name:'Corona', price:6500 },
    { id:'coronacero', name:'Corona Cero', price:6500 },
    { id:'michelob', name:'Michelob', price:6500 },
  ]},
  { id:'vinos', title:'VINOS Y ESPUMANTES', color:'rojo', items:[
    { id:'nicassiamalbec', name:'Nicassia Malbec', price:20000 },
    { id:'nicassiacabernet', name:'Nicassia Cabernet Franc', price:20000 },
    { id:'catenazapata', name:'Catena Zapata Malbec', price:30000 },
    { id:'nicassiablanc', name:'Nicassia Blanc', price:20000 },
    { id:'baronb', name:'Baron B', price:60000 },
  ]},
  { id:'bebidas', title:'BEBIDAS SIN ALCOHOL', color:'azul', items:[
    { id:'agua', name:'Agua', price:3500, desc:'Mineral o con gas.' },
    { id:'gaseosa', name:'Gaseosa', price:3500, desc:'Línea Coca-Cola.' },
    { id:'aguatonica', name:'Agua tónica', price:3500 },
  ]},
];
