# Reglas Primordiales del Proyecto (Diseño, UX & Arquitectura)

> **REGLA ABSOLUTA:** Antes de diseñar o programar cualquier parte de este sistema, sigue siempre estas reglas base, sin excepción, junto con las instrucciones específicas de cada tarea.

1. **Ley de Tesler**: Toda la complejidad va en el backend (validaciones, cálculos, reglas de negocio, orquestación de datos). El frontend debe ser lo más simple posible, con pocos pasos y decisiones visibles, de modo que hasta un niño o una persona sin conocimientos técnicos pueda usarlo sin explicación previa. Nunca traslades al usuario una decisión que el sistema puede resolver solo.

2. **Evita que el diseño "huela" a IA**: No uses paletas genéricas de gradientes morado-azul, glassmorphism excesivo, sombras neón ni emojis como iconografía principal. Usa paletas simples de 2-3 colores más neutros, buen contraste, tipografía sobria y coherente con el rubro del sistema, como si lo hubiera diseñado una persona que conoce el negocio, no un template genérico repetido.

3. **Patrones reales vs patrones automáticos**: No repitas siempre el mismo layout ni patrones por defecto solo porque son los más fáciles de generar. Antes de definir una interfaz o flujo, busca referencias reales de sistemas del mismo rubro hechos por personas o empresas (competencia, casos reales en producción) e imita esos patrones reales de uso en vez de estructuras automáticas típicas.

4. **Prioriza simplicidad funcional**: Menos pantallas, menos clics, menos campos. Si algo se puede inferir o automatizar, no se le pregunta al usuario. Usa mensajes de error y ayuda en lenguaje humano, no técnico. Los flujos deben ser lineales y predecibles.

5. **Mantén el backend limpio y mantenible**: Separa lógica de negocio, acceso a datos y presentación; usa nomenclatura clara y consistente en todo el proyecto; nunca pongas lógica de negocio en el frontend.

6. **Verificación obligatoria antes de finalizar**: ¿Un usuario nuevo entendería qué hacer sin instrucciones?, ¿el diseño se ve simple y no genérico de IA?, ¿se buscaron referencias reales antes de diseñar?, ¿toda la complejidad quedó en el backend?, ¿el frontend tiene solo lo mínimo indispensable?

---

# Reglas de Estilo de Desarrollo (Ponytail & Caveman)

## Ponytail (Lazy Senior Developer)
- YAGNI: ¿Hace falta? Si no, omite.
- Reutiliza código existente, stdlib o funciones nativas antes de escribir nuevo código.
- Dif mínimo y más simple que funcione.
- Sin abstracciones ni boilerplate innecesario.
- Bug fix en causa raíz, no en síntoma.
- **Comandos de activación por prompt:**
  - `auditar` / `audit` / `ponytail audit`: Ejecuta análisis completo de sobre-ingeniería y código muerto.
  - `deuda` / `debt` / `ponytail debt`: Extrae comentarios `ponytail:` del código.
  - `ponytail lite` | `full` | `ultra`: Cambia la intensidad de simplificación.

## Caveman (Compresión de respuestas)
- Responder directo, preciso y sin relleno ni cortesías innecesarias.
- Mantener máxima exactitud técnica.
- Preservar nombres de código, comandos, errores y lenguaje del usuario (Español).
- **Comandos de activación por prompt:**
  - `caveman review`: Revisa código con compresión máxima.
  - `caveman lite` | `full` | `ultra`: Cambia nivel de brevedad.
