# 📄 Cente Docs - Manual de Aplicación

**Cente Docs** es una plataforma de colaboración profesional que permite a múltiples usuarios firmar documentos digitalmente, navegar entre páginas de PDFs multipágina y colaborar en tiempo real con gestión segura en la nube.

---

## 📋 Tabla de Contenidos

- [Características Principales](#características-principales)
- [Guía de Usuario](#guía-de-usuario)
- [Guía de Desarrollador](#guía-de-desarrollador)
- [Instalación y Setup](#instalación-y-setup)
- [Estructura del Proyecto](#estructura-del-proyecto)
- [API y Servicios](#api-y-servicios)
- [Tecnologías Utilizadas](#tecnologías-utilizadas)
- [Troubleshooting](#troubleshooting)

---

## ✨ Características Principales

### Para Usuarios
- ✅ **Firma Digital Múltiple**: Múltiples usuarios pueden firmar el mismo documento secuencialmente
- ✅ **Navegación Multipágina**: Soporta PDFs con múltiples páginas; navega entre ellas con botones o teclado
- ✅ **Firmas Interactivas**: Coloca, mueve y redimensiona firmas en cualquier posición del documento
- ✅ **Experiencia Móvil Mejorada**: Controles táctiles optimizados para celulares y tablets
- ✅ **Firma Automática**: Sistema genera firmas automáticas o carga firmas digitales personalizadas
- ✅ **Descarga de Documentos Firmados**: Exporta PDFs con todas las firmas integradas
- ✅ **Historial de Actividad**: Registra quién firmó, cuándo y en qué página
- ✅ **Gestión de Archivos**: Sube, descarga y organiza documentos en la nube

### Para Desarrolladores
- ✅ **Arquitectura Modular**: Servicios separados para almacenamiento, autenticación, documentos
- ✅ **PDF.js Integrado**: Renderizado de PDFs cliente-side con soporte multipágina
- ✅ **Firebase + Supabase**: Autenticación segura y almacenamiento en la nube
- ✅ **Canvas API**: Composición de firmas en documentos con transformaciones
- ✅ **Persistencia Local**: Cacheo de PDFs para navegación eficiente
- ✅ **Sistema de Logging**: Logs detallados en consola para debugging

---

## 👥 Guía de Usuario

### 1. Iniciar Sesión

1. Abre la aplicación en el navegador
2. Ingresa tu correo electrónico y contraseña
3. O haz clic en **"Crear Cuenta"** para registrarte

```
Correo: tu@email.com
Contraseña: ••••••••
```

### 2. Cargar un Documento

1. Ve a la pestaña **"Documentos"**
2. Haz clic en **"Subir Documento"** o arrastra el archivo
3. Soporta: PDF, imágenes (PNG, JPG), documentos Word, Excel, PowerPoint

**Límite de tamaño**: 50MB por archivo

### 3. Firmar un Documento

#### Opción A: Firma Automática
1. Abre el documento desde el selector
2. Carga o genera tu firma en el panel **"Firma Digital"**
3. Haz clic en **"Agregar Firma Automáticamente"**
4. El sistema detectará automáticamente el mejor espacio disponible (optimizado para firmas compactas)

#### Opción B: Firma Manual
1. Abre el documento
2. Carga tu firma
3. Haz clic en **"Modo de Firma"** o directamente **"Agregar Firma"**
4. **Haz clic/toca el lugar donde deseas colocar la firma**
5. Ajusta el tamaño y posición usando los controles

#### 📱 Uso en Dispositivos Móviles
- **Mover**: Toca y arrastra la firma con un dedo
- **Redimensionar**: Usa los círculos (manejadores) en las esquinas. Hemos mejorado la detección táctil para facilitar el agarre
- **Eliminar**: Toca la "X" roja en la esquina superior derecha de la firma seleccionada
- **Nota**: El sistema ajusta automáticamente el tamaño para mantener la legibilidad en pantallas pequeñas

### 4. Navegar en Documentos Multipágina

1. Abre un PDF con múltiples páginas
2. En la esquina superior derecha aparecerán botones de navegación:
   - **◄ Anterior**: Va a la página anterior
   - **Página N/Total**: Muestra la página actual
   - **Siguiente ►**: Va a la siguiente página

**Alternativamente**:
- Scroll hacia arriba/abajo en el área del documento

### 5. Guardar Documento Firmado

1. Una vez hayas agregado todas las firmas
2. Haz clic en **"Guardar"** en el panel de firmas
3. El sistema procesará el documento:
   - **Detección Inteligente de Orientación**: Ajusta automáticamente cada página (vertical u horizontal) para que no se corte contenido
   - **Integración de Firmas**: Combina las firmas con el documento original en alta calidad
4. Se guardará automáticamente en tu carpeta de "Documentos Firmados"

### 6. Descargar Documento

1. Ve a **"Archivos"** → pestaña **"Documentos Firmados"**
2. Haz clic en el documento
3. Selecciona **"Descargar"** (icono de descarga)

---

## 👨‍💻 Guía de Desarrollador

### Arquitectura General

La aplicación sigue una arquitectura orientada a servicios con tres capas:

```
┌─────────────────────────────────────┐
│  Interface (HTML + CSS)             │
├─────────────────────────────────────┤
│  Application Layer (app.js)         │
│  - DocumentService                  │
│  - FileService                      │
│  - DocumentExportService            │
├─────────────────────────────────────┤
│  Backend Services                   │
│  - Firebase (Auth)                  │
│  - Supabase (Storage)               │
│  - Firestore (Metadata)             │
└─────────────────────────────────────┘
```

### Servicios Principales

#### 1. **DocumentService**
Maneja la carga, renderización y manipulación de documentos.

**Métodos Clave**:
```javascript
DocumentService.loadDocument(file)              // Carga un documento
DocumentService.renderDocument()                // Renderiza el documento
DocumentService.renderPDFDocument(canvas, ctx)  // Renderiza página específica
DocumentService.addSignatureToDocument(x, y)   // Agrega firma en posición
DocumentService.goToPage(n)                     // Navega a página N
DocumentService.nextPage() / prevPage()         // Navega entre páginas
DocumentService.renderExistingSignatures()      // Re-renderiza firmas
```

**Propiedades Clave**:
```javascript
DocumentService.currentDocument      // Documento actual cargado
DocumentService.currentPage          // Página actual siendo mostrada
DocumentService.totalPages           // Total de páginas del PDF
DocumentService.documentSignatures   // Array de firmas del documento
DocumentService.pdfDocument          // Referencia cacheada al PDF (pdf.js)
```

#### 2. **FileService**
Gestiona la carga, descarga y listado de archivos.

**Métodos Clave**:
```javascript
FileService.uploadFile(file)              // Sube archivo a Supabase
FileService.downloadFile(fileId)          // Descarga archivo
FileService.deleteFile(fileId)            // Elimina archivo
FileService.addSignedDocument(...)        // Guarda documento firmado
FileService.renderFilesGrid()             // Renderiza lista de archivos
```

#### 3. **DocumentExportService**
Combina documentos con firmas y exporta como PDF.

**Métodos Clave**:
```javascript
DocumentExportService.combineSignaturesWithDocument()  // Combina y exporta
DocumentExportService.combineWithPDF()                 // Exporta como PDF multipágina
DocumentExportService.combineWithImage()               // Exporta imagen con firmas
```

### Flujo de Firma (Multipágina)

```
1. Usuario abre documento (PDF multipágina)
2. loadDocument() carga y cachea el PDF
3. renderPDFDocument() renderiza la página actual
4. createPageControls() crea navegación
5. Usuario navega con goToPage(), nextPage(), prevPage()
6. renderExistingSignatures() muestra firmas de la página actual
7. Usuario hace clic para firmar → addSignatureToDocument(x, y)
8. Firma se guarda con atributo 'page: currentPage'
9. Usuario guarda → saveDocumentWithSignatures()
10. combineWithPDF() itera todas las páginas
11. Dibuja firmas en su página correspondiente
12. Exporta PDF final con todas las firmas integradas
```

### Manejo de Firmas (Técnico)

Cada firma es un objeto JavaScript:
```javascript
{
  id: 'sig_1765544415749_abc123xyz',
  data: 'data:image/png;base64,...',      // Data URL de la firma
  userName: 'Manuel Quintero',
  userEmail: 'manuel@example.com',
  page: 1,                                // Página donde está la firma
  x: 150,                                 // Posición X en píxeles (canvas)
  y: 200,                                 // Posición Y en píxeles (canvas)
  width: 150,                             // Ancho
  height: 60,                             // Alto
  timestamp: Date,                        // Cuándo se firmó
  type: 'auto' | 'upload',                // Tipo de firma
  bakedIn: false,                         // Si ya está integrada en la imagen
  placedBy: 'user_placement' | 'auto',    // Cómo fue colocada
  confidence: 0.9                         // Confianza en la detección automática
}
```

### Renderización de PDF Multipágina

**Clave**: El PDF.js se cachea en `pdfDocument` para evitar recargas innecesarias.

```javascript
// Caching del PDF
if (!this.pdfDocument || this.pdfDocumentUrl !== pdfUrl) {
    const loadingTask = pdfjsLib.getDocument(pdfUrl);
    this.pdfDocument = await loadingTask.promise;
    this.totalPages = this.pdfDocument.numPages;
}

// Obtener página específica
const pageIndex = Math.min(Math.max(1, pageNumber), this.totalPages);
const page = await this.pdfDocument.getPage(pageIndex);

// Renderizar en canvas
const viewport = page.getViewport({ scale: 2.0 });
const renderContext = { canvasContext: ctx, viewport };
await page.render(renderContext).promise;
```

**Nota**: Se cancelan renders anteriores para evitar conflictos:
```javascript
if (this.lastRenderTask && typeof this.lastRenderTask.cancel === 'function') {
    this.lastRenderTask.cancel();
}
const renderTask = page.render(renderContext);
this.lastRenderTask = renderTask;
await renderTask.promise;
```

### Composición Multipágina en Exportación

En `combineWithPDF()`:
```javascript
// Itera cada página del PDF
for (let p = 1; p <= numPages; p++) {
    const page = await pdf.getPage(p);
    // Renderizar página en canvas
    
    // Obtener firmas para esta página
    const sigs = documentSignatures.filter(s => (s.page || 1) === p);
    
    // Dibujar firmas en sus posiciones
    for (const sig of sigs) {
        ctx.drawImage(signatureImage, sig.x * scale, sig.y * scale, ...);
    }
    
    // Añadir página a PDF final
    pdfOutput.addPage([...]);
}
```

### Integración de Servicios Backend

#### Firebase (Autenticación)
```javascript
// Inicialización
const firebaseConfig = { /* ... */ };
const auth = firebase.auth();

// Login
auth.signInWithEmailAndPassword(email, password);

// Logout
auth.signOut();

// Usuario actual
firebase.auth().currentUser;
```

#### Supabase (Almacenamiento)
```javascript
// Upload
const supabase = createClient(url, apiKey);
await supabase.storage.from('centedocs').upload(path, file);

// Download
const { data } = await supabase.storage.from('centedocs').getPublicUrl(path);

// Delete
await supabase.storage.from('centedocs').remove([path]);
```

#### Firestore (Metadata)
```javascript
// Guardar documento
await db.collection('users').doc(uid).collection('files').add(docData);

// Obtener documentos
const docs = await db.collection('users').doc(uid).collection('files').get();

// Guardar actividad
await db.collection('activity').add({ type, description, ... });
```

---

## ⚙️ Instalación y Setup

### Requisitos
- Node.js 14+ (para desarrollo)
- Navegador moderno (Chrome, Firefox, Safari, Edge)
- Cuenta en Firebase
- Cuenta en Supabase

### Instalación Local

1. **Clonar repositorio**:
```bash
git clone <repository-url>
cd CenteDocsPrueba
```

2. **Configurar Firebase**:
   - Ve a [Firebase Console](https://console.firebase.google.com/)
   - Crea un proyecto
   - Obtén las credenciales
   - En `app.js`, actualiza `firebaseConfig`:
```javascript
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_BUCKET",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID"
};
```

3. **Configurar Supabase**:
   - Ve a [Supabase](https://supabase.com/)
   - Crea un proyecto
   - Crea un bucket llamado `centedocs`
   - En `app.js`, actualiza:
```javascript
const supabase = createClient(
    'https://YOUR_PROJECT.supabase.co',
    'YOUR_ANON_KEY'
);
```

4. **Servir localmente**:
```bash
# Opción 1: Usar Python
python -m http.server 8000

# Opción 2: Usar Node http-server
npx http-server -p 8000

# Opción 3: Usar Live Server en VS Code
# Instala la extensión y haz click derecho → "Open with Live Server"
```

5. **Acceder a la aplicación**:
```
http://localhost:8000
```

### Deploy en GitHub Pages

1. **Push a GitHub**:
```bash
git add .
git commit -m "Deploy"
git push origin main
```

2. **Habilitar GitHub Pages**:
   - Ve a Settings → Pages
   - Selecciona `main` como rama
   - Espera a que se construya

3. **Acceder**:
```
https://usuario.github.io/CenteDocsPrueba/
```

---

## 📁 Estructura del Proyecto

```
CenteDocsPrueba/
├── index.html              # HTML principal con estructura de UI
├── styles.css              # Estilos (responsive, temas)
├── app.js                  # Lógica principal (8500+ líneas)
│   ├── SupabaseStorageService    // Upload/download de archivos
│   ├── CloudStorageService       // Metadata en Firestore
│   ├── FileService               // Gestión de archivos
│   ├── DocumentService           // Renderización y firmas
│   ├── DocumentExportService     // Exportación a PDF
│   └── (Otras clases y funciones)
├── README.md               # Este archivo
└── .gitignore              # Archivos a ignorar en git
```

**Tamaño de app.js**: ~8500 líneas (monolítico por simplicidad; puede refactorizarse en módulos)

---

## 🔌 API y Servicios

### API REST (Supabase)

**Upload**:
```bash
POST /storage/v1/object/centedocs/users/{uid}/uploads/{filename}
Content-Type: application/octet-stream
Authorization: Bearer <token>
```

**Download**:
```bash
GET /storage/v1/object/public/centedocs/users/{uid}/uploads/{filename}
```

### Firebase Realtime Listeners

```javascript
firebase.auth().onAuthStateChanged(user => {
    if (user) {
        console.log('Logged in:', user.email);
    }
});
```

### Firestore Collections

**Estructura**:
```
firestore/
├── users/{uid}
│   ├── files/{fileId}          // Metadatos de archivos
│   └── activity/{activityId}   // Historial de actividad
└── shared                       // Documentos compartidos (futuro)
```

---

## 🛠 Tecnologías Utilizadas

| Capa | Tecnología | Propósito |
|------|-----------|----------|
| **Frontend** | HTML5 | Estructura |
| | CSS3 | Estilos y responsive |
| | Vanilla JS | Lógica sin frameworks |
| **PDF** | PDF.js 3.4.120 | Renderización de PDFs |
| | jsPDF | Creación de PDFs |
| | html2canvas | Captura de canvas |
| **Autenticación** | Firebase Auth | Login seguro |
| **Almacenamiento** | Supabase Storage | Archivos en la nube |
| | Firestore | Metadata y actividad |
| **UI** | Font Awesome 6.4.0 | Iconos |
| **Hosting** | GitHub Pages | Deployment (estático) |

---

## 📊 Diagrama de Flujos

### Flujo de Login
```
Usuario abre app
    ↓
¿Está autenticado? (localStorage + Firebase)
    ├─ SÍ → Cargar lista de archivos → App principal
    └─ NO → Mostrar pantalla de login
```

### Flujo de Firma
```
Usuario abre documento
    ↓
loadDocument() → cachea PDF
    ↓
renderPDFDocument() → muestra página 1
    ↓
createPageControls() → botones de navegación
    ↓
Usuario hace clic en documento
    ↓
addSignatureToDocument(x, y) → crea firma con page=currentPage
    ↓
renderExistingSignatures() → muestra firmas de la página actual
    ↓
Usuario guarda → saveDocumentWithSignatures()
    ↓
combineWithPDF() → itera páginas, dibuja firmas en su página
    ↓
Exporta PDF multipágina final
```

---

## 🐛 Troubleshooting

### "Error: Cannot use the same canvas during multiple render() operations"
**Causa**: Dos renders concurrentes de PDF.js en el mismo canvas.
**Solución**: Se cancela el render anterior automáticamente. Si persiste, verifica:
```javascript
if (this.lastRenderTask && this.lastRenderTask.cancel) {
    this.lastRenderTask.cancel();
}
```

### "No aparecen las firmas en el PDF exportado"
**Causa**: Mismatch entre escala de display y canvas.
**Solución**: 
- Verifica en consola que `scaleFactorX` y `scaleFactorY` se calculan correctamente
- Asegúrate que `documentSignatures` contiene las firmas (consolelog)
- Comprueba que `signature.page === currentPageBeingRendered`

### "Documento no carga o se ve en blanco"
**Causa**: URL de Supabase inaccesible o CORS issue.
**Solución**:
- Verifica en consola el error exacto (`Error al renderizar PDF:`)
- Confirma que la URL de Supabase es pública
- Prueba descargar el archivo directamente

### "Firma no se coloca donde hago clic"
**Causa**: Coordinate mapping incorrecto (display vs canvas pixel).
**Solución**:
- Verifica en consola logs de `addSignatureToDocument`
- Usa `getBoundingClientRect()` para obtener coordenadas de display correctas:
```javascript
const rect = canvas.getBoundingClientRect();
const displayX = event.clientX - rect.left;
const displayY = event.clientY - rect.top;
```

### "Dificultad para redimensionar en móvil"
**Causa**: Precisión táctil en pantallas pequeñas.
**Solución**:
- Los puntos de control tienen un área de detección ampliada (40px) invisible.
- Intenta tocar ligeramente fuera de la esquina visible de la firma.
- Evita hacer zoom excesivo en la página completa mientras firmas.

### "¿Cómo debuggear?"
1. Abre **DevTools** (F12)
2. Ve a **Consola** (Console tab)
3. Busca logs como:
   - `📄 loadDocument INICIADO` → document load
   - `PDF cargado, páginas =` → PDF page count
   - `🔄 Llamando renderSignaturesList` → signatures update
   - `combineWithPDF:` → export process
4. Verifica **Network** tab para requests fallidos

---

## 📝 Notas para Contribuidores

### Estándar de Código

- **Nombres**: camelCase para variables/métodos, PascalCase para clases
- **Comentarios**: En español, descriptivos
- **Logging**: Usar `console.log` con emojis para visibility
- **Async**: Usar `async/await`, evitar callbacks anidados
- **Errores**: Siempre incluir `try/catch` con mensajes útiles

### Git Workflow
```bash
git checkout -b feature/nueva-feature
# ... hacer cambios ...
git add .
git commit -m "feat: descripción clara"
git push origin feature/nueva-feature
# → Crear Pull Request
```

### Testing
- Test manual en Chrome, Firefox, Safari
- Prueba en dispositivos móviles (responsive)
- Verifica PDFs con 1, 5, 10+ páginas
- Test múltiples usuarios firmando el mismo doc

---

## 📞 Soporte y Contacto

Para preguntas, bugs o sugerencias:
1. Abre un issue en GitHub
2. Describe el problema con detalles y logs
3. Incluye pasos para reproducir

---

## 📄 Licencia

Este proyecto es propiedad de **Constructora Centenario**. Uso restringido sin permiso explícito.

---

**Última actualización**: Diciembre 2025  
**Versión**: 1.0  
