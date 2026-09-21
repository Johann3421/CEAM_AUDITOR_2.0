# Cambio: Botón de Copiar Características en Filtro por Piezas

- **Fecha:** 2026-09-21
- **Tipo:** Feature / UX
- **Estado:** Completado

---

## Contexto y Objetivo
En el apartado de **Filtro por Piezas** (`/filtro-piezas`), en la tarjeta de producto (vista Grid), cada ficha técnica contaba con un botón de copiado rápido para el Número de Parte, pero no para la descripción técnica o características completas de la ficha de Perú Compras.

El usuario solicitó:
- Agregar un botón de copiar también al costado de las características para facilitar al usuario la extracción inmediata del texto descriptivo y especificaciones oficiales para cotizaciones y propuestas.

---

## Implementación Técnica
1. **Archivo modificado:**
   - `frontend/src/pages/FiltroPiezas.jsx`

2. **Detalles del cambio:**
   - **Estado local:** Adición de `copiedDescId` para tracking individual de feedback visual reactivo.
   - **Función de copiado:** Creación de `copyDescription(text, id)` que escribe en `navigator.clipboard.writeText(...)` y activa el feedback temporal (2 segundos) en el botón correspondiente.
   - **UI / Layout:**
     - Envolvimiento de la descripción (`WebkitLineClamp: 2`, `height: 35`) en un contenedor flex con `gap: 6` y `alignItems: 'flex-start'`.
     - Integración del botón de copiado al costado derecho del texto de características con icono `<Copy size={13} />` que conmuta dinámicamente a `<Check size={13} color="var(--c-success)" />` y tooltip `¡Copiado!` al hacer clic.

---

## Principios Aplicados
- **Ley de Tesler:** Operación en un único clic, sin modales ni pasos intermedios.
- **Ponytail Ultra:** Reutilización de iconos ya importados (`Copy`, `Check`) y APIs estándar del navegador (`navigator.clipboard`).
- **Coherencia Visual:** Estilo idéntico y sobrio acorde al botón existente de Número de Parte, respetando la paleta neutra sin artefactos visuales innecesarios.

---

## Próximos Pasos
- Despliegue en producción mediante commit y push a `main`.
