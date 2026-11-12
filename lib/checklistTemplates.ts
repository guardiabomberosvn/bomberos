import type { ChecklistCategory } from "@/lib/types";

// Modelos sugeridos de checklist para un cuerpo de bomberos. Son solo un
// punto de partida: al cargarlos en un equipo se copian los puntos y después
// se pueden editar, borrar o agregar otros — cada cuerpo ajusta los suyos.
export interface ChecklistTemplate {
  key: string;
  label: string;
  category: ChecklistCategory;
  questions: string[];
}

export const CHECKLIST_TEMPLATES: ChecklistTemplate[] = [
  {
    key: "autobomba",
    label: "Autobomba / unidad de ataque",
    category: "maquinas",
    questions: [
      "Combustible suficiente",
      "Nivel de aceite del motor",
      "Nivel de líquido refrigerante",
      "Nivel de líquido de frenos",
      "Neumáticos: presión y desgaste (incluido el auxilio)",
      "Batería y arranque del motor",
      "Luces, balizas y luces de freno",
      "Sirena y bocina",
      "Agua en tanque",
      "Bomba de agua: funciona y sin pérdidas",
      "Mangueras, lanzas y acoples completos",
      "Escaleras y herramientas sujetas en su lugar",
      "Equipos de respiración (ERA) a bordo y completos",
      "Extintor y botiquín a bordo",
      "Radio / comunicaciones funcionando",
      "Limpieza general de la unidad",
      "Documentación del vehículo a bordo",
    ],
  },
  {
    key: "rescate",
    label: "Unidad de rescate / camioneta",
    category: "maquinas",
    questions: [
      "Combustible suficiente",
      "Nivel de aceite del motor",
      "Nivel de líquido refrigerante",
      "Neumáticos: presión y desgaste (incluido el auxilio)",
      "Batería y arranque del motor",
      "Luces, balizas y luces de freno",
      "Sirena y bocina",
      "Herramientas de rescate completas y sujetas",
      "Botiquín y equipo de primeros auxilios",
      "Radio / comunicaciones funcionando",
      "Limpieza general de la unidad",
      "Documentación del vehículo a bordo",
    ],
  },
  {
    key: "era",
    label: "Equipo de respiración autónoma (ERA)",
    category: "equipamiento",
    questions: [
      "Presión del cilindro completa según el manómetro",
      "Cilindro sin golpes ni daños, con prueba hidráulica vigente",
      "Máscara limpia, sin roturas y con buen sello",
      "Visor de la máscara sin rayaduras ni grietas",
      "Reguladores y mangueras sin pérdidas",
      "Alarma de baja presión funcionando",
      "Arneses y correas en buen estado",
      "Válvulas y conexiones sin fugas",
    ],
  },
  {
    key: "epp",
    label: "Equipo de protección personal (EPP)",
    category: "equipamiento",
    questions: [
      "Casco en buen estado, con visor y barbijo",
      "Capucha / monja sin roturas",
      "Chaquetón sin roturas, con cierres y reflectivos",
      "Pantalón sin roturas, con reflectivos",
      "Botas sin cortes y con suela en buen estado",
      "Guantes sin roturas ni desgaste",
      "Equipo limpio y sin contaminar",
    ],
  },
  {
    key: "hidraulica",
    label: "Herramienta hidráulica de rescate",
    category: "herramientas",
    questions: [
      "Motor / bomba arranca y funciona",
      "Nivel de combustible (si es a motor)",
      "Nivel de aceite hidráulico",
      "Mangueras sin cortes, golpes ni pérdidas",
      "Acoples y conexiones en buen estado",
      "Hojas, separador o cortador sin daños",
      "Abre y cierra correctamente",
      "Guardada completa y limpia",
    ],
  },
  {
    key: "motosierra",
    label: "Motosierra / motodisco",
    category: "herramientas",
    questions: [
      "Combustible y mezcla correctos",
      "Aceite de cadena",
      "Cadena o disco afilado y en buen estado",
      "Tensión de la cadena correcta",
      "Arranca y acelera bien",
      "Freno de cadena / protector funcionando",
      "Filtro de aire limpio",
      "Bujía en buen estado",
    ],
  },
  {
    key: "motobomba",
    label: "Motobomba / generador / ventilador",
    category: "herramientas",
    questions: [
      "Combustible suficiente",
      "Nivel de aceite del motor",
      "Arranca y funciona",
      "Sin pérdidas de combustible ni aceite",
      "Mangueras y accesorios completos",
      "Cables y fichas en buen estado (si corresponde)",
      "Limpio y guardado en su lugar",
    ],
  },
  {
    key: "cuerdas",
    label: "Cuerdas y equipo de rescate en altura",
    category: "herramientas",
    questions: [
      "Cuerdas sin cortes, deshilachados ni zonas rígidas",
      "Mosquetones cierran y traban bien",
      "Arneses y cintas sin desgaste",
      "Descensores y anclajes en buen estado",
      "Fecha de vida útil / registro de uso al día",
      "Guardado limpio y seco",
    ],
  },
];
