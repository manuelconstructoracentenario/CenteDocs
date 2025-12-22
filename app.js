// ============================================
// SERVICIO DE SUPABASE STORAGE
// ============================================

class SupabaseStorageService {
    constructor() {
        this.client = window.supabaseClient || supabase;
        this.bucketName = 'centedocs';
        this.maxFileSize = 50 * 1024 * 1024; // 50MB
    }

    /**
     * Subir archivo a Supabase Storage
     * @param {File} file - Archivo a subir
     * @param {string} folder - Carpeta dentro del bucket
     * @returns {Promise<Object>} Información del archivo subido
     */
    async uploadFile(file, folder = 'uploads') {
        try {
            // Validar tamaño del archivo (Supabase límite: 50MB)
            if (file.size > 50 * 1024 * 1024) {
                throw new Error(`El archivo excede el tamaño máximo de 50MB (tamaño actual: ${(file.size / 1024 / 1024).toFixed(2)}MB)`);
            }

            // Generar nombre único para el archivo
            const timestamp = Date.now();
            const randomString = Math.random().toString(36).substring(2, 10);
            const fileExtension = file.name.split('.').pop();
            const safeFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
            const fileName = `${folder}/${timestamp}_${randomString}_${safeFileName}`;
            
            console.log('Subiendo a Supabase:', fileName, 'Tamaño:', (file.size / 1024).toFixed(2), 'KB');
            
            // Subir archivo a Supabase Storage
            const { data, error } = await this.client.storage
                .from(this.bucketName)
                .upload(fileName, file, {
                    cacheControl: '3600',
                    upsert: false,
                    contentType: file.type
                });

            if (error) {
                console.error('Error subiendo a Supabase:', error);
                
                // Manejo específico de errores de Supabase
                if (error.message.includes('File size exceeds')) {
                    throw new Error('El archivo excede el tamaño máximo permitido por Supabase (50MB)');
                } else if (error.message.includes('Invalid file format')) {
                    throw new Error('Formato de archivo no soportado');
                } else {
                    throw new Error(`Error de Supabase: ${error.message}`);
                }

                // FALLBACK: si por alguna razón no encontramos elementos DOM o no se dibujaron,
                // usar la información guardada en DocumentService.documentSignatures (coordenadas en px)
                try {
                    const savedSigs = DocumentService.documentSignatures || [];
                    if (savedSigs.length > 0) {
                        console.log('combineWithPDF: usando fallback con DocumentService.documentSignatures =', savedSigs.length);
                        // displayCanvas puede no existir si el documento no está mostrado, usar bounding rect si está disponible
                        const displayCanvasAttr = document.getElementById('documentCanvas');
                        const displayRectAttr = displayCanvasAttr ? displayCanvasAttr.getBoundingClientRect() : null;
                        const docCanvasPixelWidth = displayRectAttr ? displayRectAttr.width : (displayCanvasAttr ? displayCanvasAttr.width : canvas.width);
                        const docCanvasPixelHeight = displayRectAttr ? displayRectAttr.height : (displayCanvasAttr ? displayCanvasAttr.height : canvas.height);
                        const scaleXAttr = canvas.width / docCanvasPixelWidth;
                        const scaleYAttr = canvas.height / docCanvasPixelHeight;

                        for (const s of savedSigs) {
                            try {
                                const img = new Image();
                                img.src = s.data; // data URL
                                await this.waitForImageLoad(img);
                                const x = (typeof s.normX === 'number' ? s.normX * canvas.width : (s.x || 0) * scaleXAttr);
                                const y = (typeof s.normY === 'number' ? s.normY * canvas.height : (s.y || 0) * scaleYAttr);
                                const width = (typeof s.normWidth === 'number' ? s.normWidth * canvas.width : (s.width || img.naturalWidth) * scaleXAttr);
                                const height = (typeof s.normHeight === 'number' ? s.normHeight * canvas.height : (s.height || img.naturalHeight) * scaleYAttr);
                                ctx.imageSmoothingEnabled = true;
                                ctx.imageSmoothingQuality = 'high';
                                try {
                                    ctx.drawImage(img, x, y, width, height);
                                } catch (innerErr) {
                                    console.error('combineWithPDF fallback drawImage error', innerErr, { x, y, width, height });
                                }
                            } catch (imgErr) {
                                console.warn('combineWithPDF fallback carga de imagen falló', imgErr);
                            }
                        }
                    }
                } catch (fbErr) {
                    console.error('Error en fallback de combineWithPDF:', fbErr);
                }
            }

            // Obtener URL pública del archivo
            const { data: urlData } = this.client.storage
                .from(this.bucketName)
                .getPublicUrl(fileName);

            console.log('Archivo subido exitosamente:', urlData.publicUrl);

            return {
                url: urlData.publicUrl,
                path: data.path,
                fileName: file.name,
                size: file.size,
                type: file.type,
                uploadedAt: new Date().toISOString()
            };

        } catch (error) {
            console.error('Error en uploadFile:', error);
            throw error;
        }
    }

    /**
     * Eliminar archivo de Supabase Storage
     * @param {string} filePath - Ruta del archivo en el bucket
     * @returns {Promise<boolean>} True si se eliminó correctamente
     */
    async deleteFile(filePath) {
        try {
            const { error } = await this.client.storage
                .from(this.bucketName)
                .remove([filePath]);
            
            if (error) {
                console.error('Error eliminando archivo de Supabase:', error);
                throw error;
            }
            
            console.log('Archivo eliminado de Supabase:', filePath);
            return true;
            
        } catch (error) {
            console.error('Error en deleteFile:', error);
            throw error;
        }
    }

    /**
     * Obtener URL de descarga de un archivo
     * @param {string} filePath - Ruta del archivo
     * @returns {string} URL pública del archivo
     */
    getFileUrl(filePath) {
        const { data } = this.client.storage
            .from(this.bucketName)
            .getPublicUrl(filePath);
        return data.publicUrl;
    }

    /**
     * Listar archivos en un directorio
     * @param {string} folder - Carpeta a listar
     * @returns {Promise<Array>} Lista de archivos
     */
    async listFiles(folder = '') {
        try {
            const { data, error } = await this.client.storage
                .from(this.bucketName)
                .list(folder);
            
            if (error) {
                console.error('Error listando archivos:', error);
                throw error;
            }
            
            return data;
        } catch (error) {
            console.error('Error en listFiles:', error);
            return [];
        }
    }

    /**
     * Descargar archivo directamente
     * @param {string} filePath - Ruta del archivo
     * @param {string} fileName - Nombre para el archivo descargado
     */
    async downloadFile(filePath, fileName) {
        try {
            const { data, error } = await this.client.storage
                .from(this.bucketName)
                .download(filePath);
            
            if (error) {
                console.error('Error descargando archivo:', error);
                throw error;
            }
            
            // Crear URL para descarga
            const url = URL.createObjectURL(data);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName || filePath.split('/').pop();
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
        } catch (error) {
            console.error('Error en downloadFile:', error);
            throw error;
        }
    }
}

// Sistema de almacenamiento en la nube con Firebase (metadata) y Supabase (archivos)
class CloudStorageService {
    constructor() {
        this.db = firebase.firestore();
        this.auth = firebase.auth();
        this.supabase = new SupabaseStorageService();
    }

    // Usuarios
    async saveUser(user) {
        try {
            await this.db.collection('users').doc(user.email).set({
                ...user,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
            });
            return user;
        } catch (error) {
            console.error('Error saving user to Firebase:', error);
            throw error;
        }
    }

    async getUser(email) {
        try {
            const doc = await this.db.collection('users').doc(email).get();
            return doc.exists ? doc.data() : null;
        } catch (error) {
            console.error('Error getting user from Firebase:', error);
            return null;
        }
    }

    async getAllUsers() {
        try {
            const snapshot = await this.db.collection('users').get();
            const users = {};
            snapshot.forEach(doc => {
                users[doc.id] = doc.data();
            });
            return users;
        } catch (error) {
            console.error('Error getting users from Firebase:', error);
            return {};
        }
    }

    // Documentos
    async saveDocument(doc) {
        try {
            // Preparar documento para Firestore - NUNCA guardar contenido base64
            const firestoreDoc = {
                id: doc.id,
                name: doc.name,
                type: doc.type,
                size: doc.size || 0,
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
                uploadedBy: doc.uploadedBy,
                uploadedByName: doc.uploadedByName || 'Usuario',
                signatures: doc.signatures || [],
                extension: doc.extension || doc.name.split('.').pop().toLowerCase(),
                source: doc.source || 'uploaded',
                storage_provider: 'supabase',
                originalFileId: doc.originalFileId || null
            };
            
            // Si ya tenemos URL de Supabase, usarla
            if (doc.supabase_url) {
                firestoreDoc.supabase_url = doc.supabase_url;
                firestoreDoc.supabase_path = doc.supabase_path;
                firestoreDoc.url = doc.supabase_url;
            }
            
            // Asegurar que NO haya campo content
            if (firestoreDoc.content) {
                delete firestoreDoc.content;
            }
            
            // Si el documento tiene uploadDate, mantenerlo; si no, agregar fecha actual
            if (doc.uploadDate) {
                if (doc.uploadDate.toDate) {
                    firestoreDoc.uploadDate = doc.uploadDate;
                } else {
                    firestoreDoc.uploadDate = firebase.firestore.FieldValue.serverTimestamp();
                }
            } else {
                firestoreDoc.uploadDate = firebase.firestore.FieldValue.serverTimestamp();
            }
            
            console.log('Guardando en Firestore (sin contenido base64):', doc.id, doc.name);
            
            // Guardar en Firestore
            await this.db.collection('documents').doc(doc.id).set(firestoreDoc);
            
            return firestoreDoc;
            
        } catch (error) {
            console.error('Error saving document to Firebase:', error);
            throw new Error('Error al guardar documento en Firestore: ' + error.message);
        }
    }

    async getUserDocuments(userId) {
        try {
            const snapshot = await this.db.collection('documents')
                .where('uploadedBy', '==', userId)
                .orderBy('uploadDate', 'desc')
                .get();
            
            return snapshot.docs.map(doc => {
                const data = doc.data();
                // Asegurar que tenga URL
                if (!data.url && data.supabase_url) {
                    data.url = data.supabase_url;
                }
                return data;
            });
        } catch (error) {
            console.error('Error getting user documents from Firebase:', error);
            return [];
        }
    }

    async getAllDocuments() {
        try {
            const snapshot = await this.db.collection('documents')
                .orderBy('uploadDate', 'desc')
                .get();
            
            return snapshot.docs.map(doc => {
                const data = doc.data();
                // Asegurar que tenga URL
                if (!data.url && data.supabase_url) {
                    data.url = data.supabase_url;
                }
                return data;
            });
        } catch (error) {
            console.error('Error getting documents from Firebase:', error);
            return [];
        }
    }

    async deleteDocument(documentId) {
        try {
            // Primero obtener el documento para eliminar el archivo de Supabase
            const docRef = await this.db.collection('documents').doc(documentId).get();
            if (docRef.exists) {
                const docData = docRef.data();
                
                // Si tiene path de Supabase, eliminar el archivo
                if (docData.supabase_path) {
                    try {
                        await this.supabase.deleteFile(docData.supabase_path);
                    } catch (supabaseError) {
                        console.warn('No se pudo eliminar de Supabase, continuando...', supabaseError);
                    }
                }
            }
            
            // Luego eliminar la metadata de Firestore
            await this.db.collection('documents').doc(documentId).delete();
            return true;
            
        } catch (error) {
            console.error('Error deleting document from Firebase:', error);
            throw error;
        }
    }

    // Actividades
    async saveActivity(activity) {
        try {
            const activityWithId = {
                ...activity,
                id: 'act_' + Date.now(),
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            };
            
            await this.db.collection('activities').add(activityWithId);
            return activityWithId;
        } catch (error) {
            console.error('Error saving activity to Firebase:', error);
            throw error;
        }
    }

    async getRecentActivities(limit = 5) {
        try {
            const snapshot = await this.db.collection('activities')
                .orderBy('timestamp', 'desc')
                .limit(limit)
                .get();
            
            return snapshot.docs.map(doc => doc.data());
        } catch (error) {
            console.error('Error getting activities from Firebase:', error);
            return [];
        }
    }
}

class CompressionService {
    static async compressFile(file, maxSizeKB = 2048) { // Aumentado de 500KB a 2048KB
        return new Promise((resolve, reject) => {
            // Si el archivo ya está dentro del límite, devolverlo tal cual
            if (file.size <= maxSizeKB * 1024) {
                console.log(`Archivo ${file.name} dentro del límite: ${file.size / 1024}KB`);
                resolve(file);
                return;
            }

            console.log(`Comprimiendo archivo: ${file.name}, tamaño: ${file.size / 1024}KB`);

            // Si es imagen, comprimirla
            if (file.type.startsWith('image/')) {
                this.compressImage(file, maxSizeKB).then(resolve).catch(reject);
            } 
            // Si es PDF, manejar de manera especial
            else if (file.type === 'application/pdf') {
                // Para PDFs, no comprimir pero verificar tamaño máximo de Supabase (50MB)
                if (file.size > 50 * 1024 * 1024) {
                    reject(new Error(`El PDF es demasiado grande para Supabase. Máximo 50MB. Tamaño actual: ${(file.size / 1024 / 1024).toFixed(2)}MB`));
                } else {
                    // PDFs pequeños pueden subirse directamente
                    if (file.size <= 5 * 1024 * 1024) { // PDFs menores a 5MB
                        resolve(file);
                    } else {
                        // Para PDFs grandes, intentar reducir calidad
                        this.reducePDFSize(file, maxSizeKB * 1024).then(resolve).catch(() => {
                            // Si no se puede reducir, devolver el archivo original con advertencia
                            console.warn('No se pudo comprimir PDF, subiendo en tamaño original');
                            resolve(file);
                        });
                    }
                }
            }
            // Para otros tipos, intentar reducir tamaño
            else {
                this.reduceFileSize(file, maxSizeKB).then(resolve).catch(() => {
                    // Fallback: devolver el archivo original
                    resolve(file);
                });
            }
        });
    }

    static async reducePDFSize(file, maxBytes) {
        return new Promise((resolve, reject) => {
            // Para PDFs, no podemos comprimir fácilmente, así que devolvemos el archivo
            // pero verificamos que no exceda el límite de Supabase
            if (file.size <= maxBytes) {
                resolve(file);
            } else {
                reject(new Error(`El PDF es demasiado grande. Máximo ${maxBytes / 1024}KB. Tamaño actual: ${file.size / 1024}KB`));
            }
        });
    }

    static compressImage(file, maxSizeKB) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = (event) => {
                const img = new Image();
                img.src = event.target.result;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    
                    // Calcular nuevo tamaño manteniendo relación de aspecto
                    let width = img.width;
                    let height = img.height;
                    const maxDimension = 1200; // Máximo 1200px en cualquier dimensión
                    
                    if (width > height && width > maxDimension) {
                        height = (height * maxDimension) / width;
                        width = maxDimension;
                    } else if (height > maxDimension) {
                        width = (width * maxDimension) / height;
                        height = maxDimension;
                    }
                    
                    canvas.width = width;
                    canvas.height = height;
                    
                    ctx.drawImage(img, 0, 0, width, height);
                    
                    // Convertir a blob con calidad ajustable
                    let quality = 0.8;
                    canvas.toBlob((blob) => {
                        if (blob.size > maxSizeKB * 1024 && quality > 0.3) {
                            // Reducir calidad y reintentar
                            quality -= 0.1;
                            canvas.toBlob((newBlob) => {
                                resolve(new File([newBlob], file.name, {
                                    type: file.type,
                                    lastModified: Date.now()
                                }));
                            }, file.type, quality);
                        } else {
                            resolve(new File([blob], file.name, {
                                type: file.type,
                                lastModified: Date.now()
                            }));
                        }
                    }, file.type, quality);
                };
                img.onerror = reject;
            };
            reader.onerror = reject;
        });
    }

    static reduceFileSize(file, maxSizeKB) {
        return new Promise((resolve, reject) => {
            if (file.size <= maxSizeKB * 1024) {
                resolve(file);
                return;
            }
            
            // Para archivos no comprimibles, mostrar error
            reject(new Error(`El archivo es demasiado grande. Máximo ${maxSizeKB}KB. Use archivos más pequeños.`));
        });
    }
}

function handleFileError(file, error) {
    console.error(`Error con archivo ${file.name}:`, error);
    
    // Crear un archivo de fallback
    const fallbackFile = {
        ...file,
        error: true,
        errorMessage: error.message
    };
    
    return fallbackFile;
}

// Estado de la aplicación
const AppState = {
    currentUser: null,
    currentSignature: null,
    documents: [],
    documentSignatures: [],
    currentDocument: null,
    currentZoom: 1.0
};

// Sistema de Autenticación con Firebase
class AuthService {
    static async registerUser(email, password, name) {
        try {
            const userCredential = await firebase.auth().createUserWithEmailAndPassword(email, password);
            const user = userCredential.user;

            const userData = {
                uid: user.uid,
                email: user.email,
                name: name,
                role: 'owner',
                avatar: name.substring(0, 2).toUpperCase(),
                createdAt: new Date(),
                permissions: ['read', 'write', 'share']
            };

            const storage = new CloudStorageService();
            await storage.saveUser(userData);
            
            await storage.saveActivity({
                type: 'user_register',
                description: `Se registró en el sistema: ${name}`,
                userName: name
            });

            return { success: true, user: userData };
        } catch (error) {
            console.error('Error en registro Firebase:', error);
            return { success: false, error: this.getAuthErrorMessage(error) };
        }
    }

    static async loginUser(email, password) {
        try {
            const userCredential = await firebase.auth().signInWithEmailAndPassword(email, password);
            const firebaseUser = userCredential.user;

            const storage = new CloudStorageService();
            const userData = await storage.getUser(firebaseUser.email);

            if (!userData) {
                return { success: false, error: 'Usuario no encontrado en la base de datos' };
            }

            await storage.saveActivity({
                type: 'user_login',
                description: `Inició sesión en el sistema`,
                userName: userData.name
            });

            return { 
                success: true, 
                user: userData
            };
        } catch (error) {
            console.error('Error en login Firebase:', error);
            return { success: false, error: this.getAuthErrorMessage(error) };
        }
    }

    static getAuthErrorMessage(error) {
        switch (error.code) {
            case 'auth/email-already-in-use':
                return 'Ya existe una cuenta con este correo electrónico';
            case 'auth/invalid-email':
                return 'El correo electrónico no es válido';
            case 'auth/operation-not-allowed':
                return 'La operación no está permitida';
            case 'auth/weak-password':
                return 'La contraseña es demasiado débil';
            case 'auth/user-disabled':
                return 'La cuenta ha sido deshabilitada';
            case 'auth/user-not-found':
                return 'No existe una cuenta con este correo';
            case 'auth/wrong-password':
                return 'La contraseña es incorrecta';
            case 'auth/network-request-failed':
                return 'Error de conexión. Verifica tu internet';
            default:
                return 'Error en la autenticación: ' + error.message;
        }
    }

    static logout() {
        // Limpiar recursos antes de cerrar sesión
        FileService.cleanup();
        
        // Limpiar documento actual
        if (DocumentService.currentDocument && DocumentService.currentDocument.url && 
            DocumentService.currentDocument.url.startsWith('blob:')) {
            try {
                URL.revokeObjectURL(DocumentService.currentDocument.url);
            } catch (error) {
                // Ignorar
            }
        }
        
        DocumentService.currentDocument = null;
        DocumentService.documentSignatures = [];
        AppState.currentSignature = null;
        
        // Cerrar sesión en Firebase
        firebase.auth().signOut();
        
        showNotification('Sesión cerrada correctamente');
        
        document.getElementById('loginScreen').style.display = 'flex';
        document.getElementById('appContainer').classList.remove('active');
    }

    static getCurrentUser() {
        return AppState.currentUser;
    }

    static setCurrentUser(user) {
        AppState.currentUser = user;
    }

    // En AuthService.initAuthListener, mejorar el manejo de archivos:
    static initAuthListener() {
        try {
            if (!window.firebase || !firebase.auth) {
                document.getElementById('loginScreen').style.display = 'flex';
                document.getElementById('appContainer').classList.remove('active');
                return;
            }
            firebase.auth().onAuthStateChanged(async (user) => {
                if (user) {
                    const storage = new CloudStorageService();
                    const userData = await storage.getUser(user.email);
                    if (userData) {
                        AuthService.setCurrentUser(userData);
                        const currentUserName = document.getElementById('currentUserName');
                        const userAvatar = document.getElementById('userAvatar');
                        if (currentUserName) currentUserName.textContent = userData.name;
                        if (userAvatar) userAvatar.textContent = userData.avatar;
                        try {
                            const autoSignature = await SignatureGenerator.createUserSignature(userData);
                            AppState.currentSignature = autoSignature;
                            updateAutoSignaturePreview();
                        } catch (error) {}
                        document.getElementById('loginScreen').style.display = 'none';
                        document.getElementById('appContainer').classList.add('active');
                        try {
                            await FileService.loadUserDocuments();
                            const loadedFiles = FileService.files.filter(f => !f.tooLarge).length;
                            const largeFiles = FileService.files.filter(f => f.tooLarge).length;
                            if (largeFiles > 0) {
                                showNotification(`${loadedFiles} archivos cargados, ${largeFiles} archivos muy grandes (descárguelos para ver)`, 'warning');
                            }
                            DocumentService.renderDocumentSelector();
                            if (document.getElementById('files-page')?.classList.contains('active')) {
                                FileService.renderFilesGrid();
                            }
                        } catch (error) {}
                        ActivityService.loadRecentActivities();
                        showNotification(`¡Bienvenido a Cente Docs, ${userData.name}!`);
                    }
                } else {
                    AppState.currentUser = null;
                    FileService.files = [];
                    document.getElementById('loginScreen').style.display = 'flex';
                    document.getElementById('appContainer').classList.remove('active');
                }
            });
        } catch (e) {}
    }
}

// Sistema de Gestión de Archivos
class FileService {
    static files = [];
    
    static async uploadFiles(files) {
        const uploadedFiles = [];
        const storage = new CloudStorageService();
        // Ejecutar subidas en paralelo para acelerar tiempos
        const tasks = Array.from(files).map(async (file) => {
            try {
                const fileId = 'file_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
                let fileToUpload = file;
                try {
                    fileToUpload = await CompressionService.compressFile(file, 2048);
                } catch (compressionError) {
                    if (fileToUpload.size > 50 * 1024 * 1024) {
                        showNotification(`Error: ${file.name} excede 50MB (tamaño máximo de Supabase)`, 'error');
                        return null;
                    } else {
                        console.warn(`Advertencia: ${compressionError.message}`);
                    }
                }
                try {
                    showNotification(`Subiendo ${file.name} a la nube...`);
                    const supabaseResult = await storage.supabase.uploadFile(
                        fileToUpload,
                        `users/${AppState.currentUser.uid}/uploads`
                    );
                    const fileData = {
                        id: fileId,
                        name: file.name,
                        type: fileToUpload.type,
                        size: fileToUpload.size,
                        uploadDate: new Date(),
                        uploadedBy: AppState.currentUser.uid,
                        uploadedByName: AppState.currentUser.name,
                        signatures: [],
                        extension: file.name.split('.').pop().toLowerCase(),
                        source: 'uploaded',
                        supabase_url: supabaseResult.url,
                        supabase_path: supabaseResult.path,
                        url: supabaseResult.url,
                        storage_provider: 'supabase'
                    };
                    await storage.saveDocument(fileData);
                    this.files.push(fileData);
                    uploadedFiles.push(fileData);
                    await storage.saveActivity({
                        type: 'file_upload',
                        description: `Subió el archivo: ${file.name}`,
                        documentName: file.name,
                        userName: AppState.currentUser.name
                    });
                    showNotification(`Archivo ${file.name} subido correctamente`);
                    return fileData;
                } catch (supabaseError) {
                    console.error('Error subiendo a Supabase:', supabaseError);
                    showNotification(`Error al subir ${file.name}: ${supabaseError.message}`, 'error');
                    return null;
                }
            } catch (error) {
                console.error('Error uploading file:', error);
                showNotification(`Error al subir ${file.name}: ${error.message}`, 'error');
                return null;
            }
        });
        await Promise.all(tasks);
        DocumentService.refreshDocumentSelector();
        this.renderFilesGrid();
        return uploadedFiles;
    }

    // Agregar función para convertir archivo a base64
    static fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result);
            reader.onerror = error => reject(error);
        });
    }

    // Agregar función para convertir base64 a Blob
    static base64ToBlob(base64, type) {
        const binary = atob(base64.split(',')[1]);
        const array = [];
        for (let i = 0; i < binary.length; i++) {
            array.push(binary.charCodeAt(i));
        }
        return new Blob([new Uint8Array(array)], { type: type });
    }
    
    static async loadUserDocuments() {
        try {
            const storage = new CloudStorageService();
            const documents = await storage.getAllDocuments();
            
            console.log('Documentos obtenidos de Firestore:', documents.length);
            
            const processedDocs = [];
            
            for (const doc of documents) {
                try {
                    const processedDoc = { ...doc };
                    
                    // Priorizar URL de Supabase si existe
                    if (processedDoc.supabase_url) {
                        processedDoc.url = processedDoc.supabase_url;
                        processedDoc.storage_provider = 'supabase';
                    }
                    // Si tiene contenido base64 (solo para archivos pequeños)
                    else if (processedDoc.content && processedDoc.content.startsWith('data:')) {
                        // Verificar tamaño (máximo 500KB para procesar en memoria)
                        if (processedDoc.content.length < 500000) {
                            try {
                                const blob = this.base64ToBlob(processedDoc.content, processedDoc.type);
                                processedDoc.url = URL.createObjectURL(blob);
                                processedDoc.storage_provider = 'firestore';
                            } catch (error) {
                                console.warn('Error procesando base64:', processedDoc.name, error);
                                processedDoc.url = this.createPlaceholderURL(processedDoc.type, processedDoc.name);
                            }
                        } else {
                            console.warn('Documento base64 demasiado grande:', processedDoc.name);
                            processedDoc.url = this.createPlaceholderURL(processedDoc.type, processedDoc.name);
                            processedDoc.tooLarge = true;
                        }
                    }
                    // Si no tiene contenido, usar placeholder
                    else {
                        processedDoc.url = this.createPlaceholderURL(processedDoc.type, processedDoc.name);
                    }
                    
                    if (processedDoc.uploadDate && processedDoc.uploadDate.toDate) {
                        processedDoc.uploadDate = processedDoc.uploadDate.toDate();
                    }
                    
                    processedDocs.push(processedDoc);
                } catch (error) {
                    console.error('Error procesando documento individual:', doc.name, error);
                    // Continuar con el siguiente documento
                }
            }
            
            this.files = processedDocs;
            console.log('Total de archivos procesados:', processedDocs.length);
            return processedDocs;
            
        } catch (error) {
            console.error('Error general al cargar documentos:', error);
            // NO mostrar notificación aquí
            this.files = [];
            return [];
        }
    }

    static createPlaceholderURL(type, name) {
        // Crear URL de placeholder para archivos que no se pueden cargar
        return `data:${type};base64,placeholder`;
    }

    // Agregar también en la clase FileService un método para manejar archivos grandes
    static async handleLargeFile(fileId) {
        const file = this.files.find(f => f.id === fileId);
        if (!file) return;
        
        if (file.tooLarge) {
            showNotification('Este archivo es muy grande para previsualizar. Por favor descárguelo para verlo.', 'warning');
            return false;
        }
        return true;
    }

    static async loadAllDocuments() {
        try {
            const storage = new CloudStorageService();
            const documents = await storage.getAllDocuments();
            this.files = documents;
            return documents;
        } catch (error) {
            console.error('Error loading all documents:', error);
            return [];
        }
    }
    
    static getFileIcon(fileType, fileName = '') {
        const extension = fileName.split('.').pop().toLowerCase();
        
        if (fileType.startsWith('image/')) {
            return { icon: 'fas fa-file-image', color: '#2f6c46', type: 'image' };
        } else if (fileType === 'application/pdf') {
            return { icon: 'fas fa-file-pdf', color: '#e74c3c', type: 'pdf' };
        } else if (fileType.includes('word') || fileType.includes('document') || 
                   extension === 'doc' || extension === 'docx') {
            return { icon: 'fas fa-file-word', color: '#2b579a', type: 'word' };
        } else if (fileType.includes('excel') || fileType.includes('spreadsheet') || 
                   extension === 'xls' || extension === 'xlsx') {
            return { icon: 'fas fa-file-excel', color: '#217346', type: 'excel' };
        } else if (fileType.includes('powerpoint') || fileType.includes('presentation') || 
                   extension === 'ppt' || extension === 'pptx') {
            return { icon: 'fas fa-file-powerpoint', color: '#d24726', type: 'powerpoint' };
        } else if (extension === 'txt' || fileType.includes('text/plain')) {
            return { icon: 'fas fa-file-alt', color: '#6c8789', type: 'text' };
        } else if (extension === 'zip' || extension === 'rar' || fileType.includes('compressed')) {
            return { icon: 'fas fa-file-archive', color: '#f39c12', type: 'archive' };
        } else {
            return { icon: 'fas fa-file', color: '#6c8789', type: 'generic' };
        }
    }
    
    static formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    static renderFilePreviews(files) {
        const previewsContainer = document.getElementById('filePreviews');
        if (!previewsContainer) return;
        
        previewsContainer.innerHTML = '';
        
        files.forEach(file => {
            const previewItem = document.createElement('div');
            previewItem.className = 'file-preview-item';
            
            const fileInfo = this.getFileIcon(file.type, file.name);
            let previewContent = '';
            
            if (fileInfo.type === 'image') {
                previewContent = `
                    <img src="${file.url}" alt="${file.name}" class="image-preview">
                `;
            } else if (fileInfo.type === 'pdf') {
                previewContent = `
                    <div class="document-preview pdf-preview">
                        <i class="fas fa-file-pdf" style="font-size: 48px; color: #e74c3c;"></i>
                        <div>PDF Document</div>
                        <div class="file-extension">.pdf</div>
                    </div>
                `;
            } else {
                previewContent = `
                    <div class="document-preview ${fileInfo.type}-preview">
                        <i class="${fileInfo.icon}" style="font-size: 48px; color: ${fileInfo.color};"></i>
                        <div>${this.getFileTypeDisplayName(fileInfo.type)}</div>
                        <div class="file-extension">.${file.extension}</div>
                    </div>
                `;
            }
            
            previewItem.innerHTML = `
                ${previewContent}
                <div class="file-preview-name">${file.name}</div>
                <div class="file-preview-size">${this.formatFileSize(file.size)}</div>
                <div class="file-preview-actions">
                    <button class="file-preview-btn" onclick="FileService.downloadFile('${file.id}')" title="Descargar">
                        <i class="fas fa-download"></i>
                    </button>
                    <button class="file-preview-btn" onclick="FileService.editOrSignFile('${file.id}')" title="Editar/Firmar">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="file-preview-btn" onclick="FileService.removeFile('${file.id}')" title="Eliminar">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
            
            previewsContainer.appendChild(previewItem);
        });
    }
    
    static getFileTypeDisplayName(fileType) {
        const typeNames = {
            'word': 'Documento Word',
            'excel': 'Hoja de Cálculo',
            'powerpoint': 'Presentación',
            'pdf': 'PDF Document',
            'image': 'Imagen',
            'text': 'Documento de Texto',
            'archive': 'Archivo Comprimido',
            'generic': 'Documento'
        };
        return typeNames[fileType] || 'Documento';
    }
    
    static async renderFilesGrid() {
        const uploadedFilesGrid = document.getElementById('uploadedFilesGrid');
        const signedFilesGrid = document.getElementById('signedFilesGrid');
        const noUploadedFiles = document.getElementById('noUploadedFiles');
        const noSignedFiles = document.getElementById('noSignedFiles');
        const uploadedFilesCount = document.getElementById('uploadedFilesCount');
        const signedFilesCount = document.getElementById('signedFilesCount');
        
        if (!uploadedFilesGrid || !signedFilesGrid) return;
        
        try {
            // Cargar archivos si no están cargados
            if (this.files.length === 0) {
                await this.loadUserDocuments();
            }
            
            const userFiles = this.files;
            
            // Separar archivos
            const uploadedFiles = userFiles.filter(file => file.source === 'uploaded');
            const signedFiles = userFiles.filter(file => file.source === 'signed');
            
            // Ordenar archivos firmados por fecha (más reciente primero)
            signedFiles.sort((a, b) => {
                const dateA = a.uploadDate?.toDate?.() || a.uploadDate || new Date(0);
                const dateB = b.uploadDate?.toDate?.() || b.uploadDate || new Date(0);
                return dateB - dateA;
            });
            
            // Ordenar archivos subidos por fecha (más reciente primero)
            uploadedFiles.sort((a, b) => {
                const dateA = a.uploadDate?.toDate?.() || a.uploadDate || new Date(0);
                const dateB = b.uploadDate?.toDate?.() || b.uploadDate || new Date(0);
                return dateB - dateA;
            });
            
            // Renderizar archivos FIRMADOS primero
            if (signedFiles.length === 0) {
                noSignedFiles.style.display = 'block';
                signedFilesGrid.innerHTML = '';
                signedFilesGrid.appendChild(noSignedFiles);
            } else {
                noSignedFiles.style.display = 'none';
                signedFilesGrid.innerHTML = '';
                signedFiles.forEach(file => {
                    const fileCard = this.createFileCard(file, true);
                    signedFilesGrid.appendChild(fileCard);
                });
            }
            
            // Renderizar archivos SUBIDOS después
            if (uploadedFiles.length === 0) {
                noUploadedFiles.style.display = 'block';
                uploadedFilesGrid.innerHTML = '';
                uploadedFilesGrid.appendChild(noUploadedFiles);
            } else {
                noUploadedFiles.style.display = 'none';
                uploadedFilesGrid.innerHTML = '';
                uploadedFiles.forEach(file => {
                    const fileCard = this.createFileCard(file, false);
                    uploadedFilesGrid.appendChild(fileCard);
                });
            }
            
            // Actualizar contadores
            if (uploadedFilesCount) {
                uploadedFilesCount.textContent = `${uploadedFiles.length} archivo${uploadedFiles.length !== 1 ? 's' : ''}`;
            }
            if (signedFilesCount) {
                signedFilesCount.textContent = `${signedFiles.length} archivo${signedFiles.length !== 1 ? 's' : ''}`;
            }
            
            // Actualizar también el contador general
            const filesCount = document.getElementById('filesCount');
            if (filesCount) {
                filesCount.textContent = `${userFiles.length} archivo${userFiles.length !== 1 ? 's' : ''}`;
            }
            
        } catch (error) {
            console.error('Error rendering files grid:', error);
            // No mostrar notificación de error
        }
    }

    static createFileCard(file, isSigned = false) {
        const fileInfo = this.getFileIcon(file.type, file.name);
        const fileCard = document.createElement('div');
        fileCard.className = 'file-card';
        fileCard.dataset.fileId = file.id;
        
        let signedBadge = '';
        let signersInfo = '';
        let largeFileWarning = '';
        
        if (isSigned) {
            signedBadge = '<div class="signed-badge"><i class="fas fa-signature"></i> Firmado</div>';
            
            // INFORMACIÓN ESPECIAL PARA DOCUMENTOS YA FIRMADOS
            if (file.source === 'signed') {
                signedBadge = '<div class="signed-badge fully-signed"><i class="fas fa-file-signature"></i> Documento Firmado</div>';
                
                if (file.signatures && file.signatures.length > 0) {
                    const uniqueSigners = [];
                    const seenSigners = new Set();
                    
                    file.signatures.forEach(signature => {
                        if (!seenSigners.has(signature.userEmail)) {
                            seenSigners.add(signature.userEmail);
                            uniqueSigners.push(signature);
                        }
                    });
                    
                    uniqueSigners.sort((a, b) => {
                        const dateA = a.timestamp?.toDate?.() || a.timestamp || new Date(0);
                        const dateB = b.timestamp?.toDate?.() || b.timestamp || new Date(0);
                        return dateB - dateA;
                    });
                    
                    const displayedSigners = uniqueSigners.slice(0, 5);
                    const extraCount = uniqueSigners.length - 5;
                    
                    signersInfo = `
                        <div class="signers-section">
                            <div class="signers-header">
                                <i class="fas fa-users"></i> Firmado por (${uniqueSigners.length}):
                            </div>
                            <div class="signers-icons-container">
                                ${displayedSigners.map(signer => `
                                    <div class="signer-icon-wrapper" 
                                        data-signer-name="${signer.userName || 'Usuario'}" 
                                        data-signer-date="${signer.timestamp ? new Date(signer.timestamp).toLocaleDateString() : 'Fecha desconocida'}"
                                        onclick="FileService.showSignerTooltip(event, this)">
                                        <div class="signer-avatar-small">${signer.userName?.substring(0, 1).toUpperCase() || '?'}</div>
                                        <div class="signer-name-tooltip">${signer.userName || 'Usuario'}</div>
                                    </div>
                                `).join('')}
                                ${extraCount > 0 ? `
                                    <div class="signer-icon-wrapper signer-more" 
                                        data-signer-name="${extraCount} persona(s) más" 
                                        onclick="FileService.showSignerTooltip(event, this)">
                                        <div class="signer-avatar-small">+${extraCount}</div>
                                        <div class="signer-name-tooltip">${extraCount} persona(s) más</div>
                                    </div>
                                ` : ''}
                            </div>
                        </div>
                        <div class="signed-file-info">
                            <i class="fas fa-info-circle"></i> 
                            Este documento ya tiene las firmas incorporadas en la imagen.
                        </div>
                    `;
                }
            }
        }
        
        // Advertencia para archivos grandes
        if (file.tooLarge) {
            largeFileWarning = '<div class="large-file-warning"><i class="fas fa-exclamation-triangle"></i> Archivo grande</div>';
        }
        
        const fileDate = file.uploadDate?.toDate?.() || file.uploadDate || new Date();
        const formattedDate = fileDate.toLocaleDateString('es-ES', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
        
        fileCard.innerHTML = `
            <div class="file-icon">
                <i class="${fileInfo.icon}" style="color: ${fileInfo.color};"></i>
            </div>
            ${signedBadge}
            ${largeFileWarning}
            <div class="file-name">${file.name}</div>
            <div class="file-info">
                <div><i class="fas fa-calendar"></i> ${isSigned ? 'Firmado' : 'Subido'}: ${formattedDate}</div>
                <div><i class="fas fa-weight"></i> Tamaño: ${this.formatFileSize(file.size || 0)}</div>
                <div><i class="fas fa-user"></i> Por: ${file.uploadedByName || AppState.currentUser?.name || 'Usuario'}</div>
                <div><i class="fas fa-file"></i> Tipo: ${this.getFileTypeDisplayName(fileInfo.type)}</div>
                ${signersInfo}
            </div>
            <div class="file-actions">
                <button class="file-action-btn download-btn" onclick="FileService.downloadFile('${file.id}')" title="Descargar">
                    <i class="fas fa-download"></i> Descargar
                </button>
                <button class="file-action-btn preview-btn" onclick="FileService.previewFile('${file.id}')" title="Previsualizar">
                    <i class="fas fa-eye"></i> Previsualizar
                </button>
                <button class="file-action-btn highlight sign-btn" onclick="FileService.editOrSignFile('${file.id}')" title="${isSigned ? 'Agregar más firmas' : 'Editar/Firmar'}">
                    <i class="fas fa-edit"></i> ${isSigned ? 'Agregar firma' : 'Editar/Firmar'}
                </button>
            </div>
        `;
        
        return fileCard;
    }

    // ===========================================
    // NUEVA FUNCIÓN: showSignerTooltip
    // ===========================================
    static showSignerTooltip(event, element) {
        event.stopPropagation();
        
        const tooltip = document.getElementById('globalTooltip');
        if (!tooltip) return;
        
        const signerName = element.getAttribute('data-signer-name') || 'Firmante';
        const signerDate = element.getAttribute('data-signer-date') || '';
        
        // Contenido del tooltip
        let tooltipContent = `<strong>${signerName}</strong>`;
        if (signerDate) {
            tooltipContent += `<br><small>Fecha: ${signerDate}</small>`;
        }
        
        // Posicionar el tooltip
        const rect = element.getBoundingClientRect();
        const x = rect.left + (rect.width / 2);
        const y = rect.top - 10; // 10px arriba del elemento
        
        tooltip.innerHTML = tooltipContent;
        tooltip.style.left = `${x}px`;
        tooltip.style.top = `${y}px`;
        tooltip.classList.add('show');
        
        // Remover tooltip después de 3 segundos (solo en móvil) o al tocar en otro lugar
        const isMobile = window.innerWidth <= 768;
        if (isMobile) {
            setTimeout(() => {
                tooltip.classList.remove('show');
            }, 3000);
        }
        
        // También remover al tocar en cualquier otro lugar
        const removeTooltip = (e) => {
            if (e.target !== element && !element.contains(e.target)) {
                tooltip.classList.remove('show');
                document.removeEventListener('click', removeTooltip);
                document.removeEventListener('touchstart', removeTooltip, { passive: true });
            }
        };
        
        document.addEventListener('click', removeTooltip);
        document.addEventListener('touchstart', removeTooltip, { passive: true });
    }

    static async previewFile(fileId) {
        const file = this.files.find(f => f.id === fileId);
        if (!file) {
            showNotification('Archivo no encontrado', 'error');
            return;
        }
        
        // Verificar si el archivo es demasiado grande
        if (file.tooLarge) {
            showNotification('Este archivo es muy grande para previsualizar. Por favor descárguelo para verlo.', 'warning');
            return;
        }
        
        if (!file.url) {
            showNotification('No se puede previsualizar el archivo', 'error');
            return;
        }
        
        try {
            // Para PDFs, abrir en nueva ventana
            if (file.type === 'application/pdf') {
                window.open(file.url, '_blank', 'noopener,noreferrer');
            } 
            // Para imágenes, abrir en modal
            else if (file.type.startsWith('image/')) {
                this.showImagePreview(file.url, file.name);
            }
            // Para otros tipos, intentar abrir
            else {
                window.open(file.url, '_blank', 'noopener,noreferrer');
            }
        } catch (error) {
            console.error('Error al previsualizar archivo:', error);
            showNotification('Error al previsualizar el archivo', 'error');
        }
    }

    static showImagePreview(imageUrl, imageName) {
        const modal = document.createElement('div');
        modal.className = 'image-preview-modal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.9);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 2000;
            cursor: pointer;
        `;
        
        modal.innerHTML = `
            <div style="position: relative; max-width: 90%; max-height: 90%;">
                <img src="${imageUrl}" alt="${imageName}" 
                    style="max-width: 100%; max-height: 85vh; border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.5);">
                <div style="position: absolute; top: -45px; right: 0; color: white; font-weight: bold; display: flex; align-items: center; gap: 10px;">
                    <span>${imageName}</span>
                    <button onclick="this.closest('.image-preview-modal').remove()" 
                            style="background: rgba(255,255,255,0.2); border: none; color: white; font-size: 20px; cursor: pointer; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                        ×
                    </button>
                </div>
            </div>
        `;
        
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                document.body.removeChild(modal);
            }
        });
        
        document.body.appendChild(modal);
        
        // Agregar tecla ESC para cerrar
        const closeOnEsc = (e) => {
            if (e.key === 'Escape') {
                document.body.removeChild(modal);
                document.removeEventListener('keydown', closeOnEsc);
            }
        };
        document.addEventListener('keydown', closeOnEsc);
    }

    static async editOrSignFile(fileId) {
        const file = this.files.find(f => f.id === fileId);
        if (file) {
            // Verificar si el archivo ya está firmado
            if (file.source === 'signed') {
                const confirmAdd = confirm(`Este documento ya tiene ${file.signatures?.length || 0} firma(s).\n\n¿Deseas agregar una nueva firma?\n\nIMPORTANTE: Las firmas existentes no se mostrarán como elementos interactivos porque ya están incorporadas en el documento.`);
                
                if (!confirmAdd) {
                    return;
                }
            }
            
            switchPage('documents');
            
            setTimeout(async () => {
                await DocumentService.loadDocument(file);
                showNotification(`Documento "${file.name}" cargado para ${file.source === 'signed' ? 'agregar más firmas' : 'edición/firma'}`);
            }, 100);
        }
    }
    
    static async downloadFile(fileId) {
        const file = this.files.find(f => f.id === fileId);
        if (file) {
            try {
                // Si el archivo está en Supabase, usar la URL pública
                if (file.supabase_url) {
                    const a = document.createElement('a');
                    a.href = file.supabase_url;
                    a.download = file.name;
                    a.target = '_blank'; // Abrir en nueva pestaña para descargar
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                } 
                // Si el archivo tiene contenido base64, convertirlo
                else if (file.content && file.content.startsWith('data:')) {
                    const response = await fetch(file.content);
                    const blob = await response.blob();
                    const url = URL.createObjectURL(blob);
                    
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = file.name;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                } else if (file.url) {
                    const a = document.createElement('a');
                    a.href = file.url;
                    a.download = file.name;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                }
                
                showNotification(`Descargando ${file.name}`);
            } catch (error) {
                console.error('Error downloading file:', error);
                showNotification(`Error al descargar ${file.name}`, 'error');
            }
        }
    }
    
    static shareFile(fileId) {
        const file = this.files.find(f => f.id === fileId);
        if (file) {
            showNotification(`Enlace de compartir generado para ${file.name}`);
        }
    }
    
    static async removeFile(fileId) {
        if (!confirm('¿Estás seguro de que quieres eliminar este archivo?')) {
            return;
        }
        
        const file = this.files.find(f => f.id === fileId);
        if (file) {
            try {
                const storage = new CloudStorageService();
                
                // Si el archivo está en Supabase, eliminarlo de allí
                if (file.supabase_path) {
                    try {
                        await storage.supabase.deleteFile(file.supabase_path);
                    } catch (supabaseError) {
                        console.warn('No se pudo eliminar de Supabase:', supabaseError);
                    }
                }
                
                // Eliminar la metadata de Firestore
                await storage.deleteDocument(fileId);
                
                // Eliminar del array local
                this.files = this.files.filter(f => f.id !== fileId);
                this.renderFilesGrid();
                DocumentService.renderDocumentSelector();
                
                await storage.saveActivity({
                    type: 'file_delete',
                    description: `Eliminó el archivo: ${file.name}`,
                    documentName: file.name,
                    userName: AppState.currentUser.name
                });
                
                showNotification(`Archivo ${file.name} eliminado`, 'warning');
            } catch (error) {
                console.error('Error deleting file:', error);
                showNotification('Error al eliminar el archivo', 'error');
            }
        }
    }
    
    static clearPreviews() {
        const previewsContainer = document.getElementById('filePreviews');
        const previewContainer = document.getElementById('filePreviewContainer');
        if (previewsContainer) previewsContainer.innerHTML = '';
        if (previewContainer) previewContainer.style.display = 'none';
    }
    
    static async addSignedDocument(originalFileId, signedBlob, fileName, signatures) {
        try {
            const storage = new CloudStorageService();
            
            // Crear File desde Blob
            const signedFile = new File([signedBlob], fileName, { 
                type: signedBlob.type 
            });
            
            console.log('Archivo firmado creado:', fileName, 'Tamaño:', signedBlob.size, 'bytes');
            
            // Subir directamente a Supabase
            showNotification('Subiendo documento firmado a Supabase Storage...');
            
            const supabaseResult = await storage.supabase.uploadFile(
                signedFile,
                `users/${AppState.currentUser.uid}/signed`
            );
            
            console.log('Archivo subido a Supabase:', supabaseResult.url);
            
            const signedFileData = {
                id: 'signed_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                name: fileName,
                type: signedFile.type,
                size: signedFile.size,
                uploadDate: new Date(),
                uploadedBy: AppState.currentUser.uid,
                uploadedByName: AppState.currentUser.name,
                signatures: signatures,
                extension: fileName.split('.').pop().toLowerCase(),
                source: 'signed',
                originalFileId: originalFileId,
                supabase_url: supabaseResult.url,
                supabase_path: supabaseResult.path,
                url: supabaseResult.url,
                storage_provider: 'supabase'
            };
            
            // Guardar metadata en Firestore (sin contenido base64)
            await storage.saveDocument(signedFileData);
            
            // Actualizar lista local
            this.files.push(signedFileData);
            
            // Actualizar vistas
            this.renderFilesGrid();
            DocumentService.renderDocumentSelector();
            
            // Guardar actividad
            await storage.saveActivity({
                type: 'document_signed',
                description: `Firmó el documento: ${fileName}`,
                documentName: fileName,
                userName: AppState.currentUser.name
            });
            
            showNotification(`Documento firmado guardado en Supabase: ${fileName}`);
            
            return signedFileData;
            
        } catch (error) {
            console.error('Error adding signed document:', error);
            showNotification('Error al guardar documento firmado: ' + error.message, 'error');
            throw error;
        }
    }

    static filterFiles(searchTerm) {
        const uploadedFileCards = document.querySelectorAll('#uploadedFilesGrid .file-card');
        const signedFileCards = document.querySelectorAll('#signedFilesGrid .file-card');
        
        let uploadedVisibleCount = 0;
        let signedVisibleCount = 0;
        
        // Filtrar archivos subidos
        uploadedFileCards.forEach(card => {
            const fileName = card.querySelector('.file-name').textContent.toLowerCase();
            if (fileName.includes(searchTerm)) {
                card.style.display = 'block';
                uploadedVisibleCount++;
            } else {
                card.style.display = 'none';
            }
        });
        
        // Filtrar archivos firmados
        signedFileCards.forEach(card => {
            const fileName = card.querySelector('.file-name').textContent.toLowerCase();
            if (fileName.includes(searchTerm)) {
                card.style.display = 'block';
                signedVisibleCount++;
            } else {
                card.style.display = 'none';
            }
        });
        
        // Actualizar contadores
        const uploadedFilesCount = document.getElementById('uploadedFilesCount');
        const signedFilesCount = document.getElementById('signedFilesCount');
        
        if (uploadedFilesCount) {
            uploadedFilesCount.textContent = `${uploadedVisibleCount} archivo${uploadedVisibleCount !== 1 ? 's' : ''}`;
        }
        
        if (signedFilesCount) {
            signedFilesCount.textContent = `${signedVisibleCount} archivo${signedVisibleCount !== 1 ? 's' : ''}`;
        }
        
        // Mostrar mensajes si no hay resultados
        const noUploadedFiles = document.getElementById('noUploadedFiles');
        const noSignedFiles = document.getElementById('noSignedFiles');
        const uploadedFilesGrid = document.getElementById('uploadedFilesGrid');
        const signedFilesGrid = document.getElementById('signedFilesGrid');
        
        if (uploadedVisibleCount === 0 && searchTerm) {
            if (!uploadedFilesGrid.querySelector('#noSearchResultsUploaded')) {
                const noResults = document.createElement('div');
                noResults.id = 'noSearchResultsUploaded';
                noResults.className = 'no-files';
                noResults.innerHTML = `
                    <div class="no-files-icon">
                        <i class="fas fa-search"></i>
                    </div>
                    <h3>No se encontraron archivos subidos</h3>
                    <p>No hay archivos que coincidan con "${searchTerm}"</p>
                `;
                uploadedFilesGrid.appendChild(noResults);
            }
        } else {
            const noResults = uploadedFilesGrid.querySelector('#noSearchResultsUploaded');
            if (noResults) {
                noResults.remove();
            }
        }
        
        if (signedVisibleCount === 0 && searchTerm) {
            if (!signedFilesGrid.querySelector('#noSearchResultsSigned')) {
                const noResults = document.createElement('div');
                noResults.id = 'noSearchResultsSigned';
                noResults.className = 'no-files';
                noResults.innerHTML = `
                    <div class="no-files-icon">
                        <i class="fas fa-search"></i>
                    </div>
                    <h3>No se encontraron archivos firmados</h3>
                    <p>No hay archivos que coincidan con "${searchTerm}"</p>
                `;
                signedFilesGrid.appendChild(noResults);
            }
        } else {
            const noResults = signedFilesGrid.querySelector('#noSearchResultsSigned');
            if (noResults) {
                noResults.remove();
            }
        }
    }

    static cleanup() {
        console.log('Limpiando recursos de archivos...');
        // Liberar todas las URLs de objetos (blob URLs) para evitar fugas de memoria
        this.files.forEach(file => {
            if (file.url && file.url.startsWith('blob:')) {
                try {
                    URL.revokeObjectURL(file.url);
                    console.log('URL liberada para archivo:', file.name);
                } catch (error) {
                    // Ignorar errores al revocar URLs
                    console.warn('Error al liberar URL para', file.name);
                }
            }
        });
        // Limpiar el array de archivos
        this.files = [];
    }
}

// Sistema de Generación de Firmas Automáticas
class SignatureGenerator {
    static generateAutomaticSignature(user) {
        return new Promise((resolve) => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            // TAMAÑO COMPACTO: 250x60
            const width = 250;
            const height = 60;
            canvas.width = width;
            canvas.height = height;
            
            ctx.clearRect(0, 0, width, height);
            
            const name = user.name;
            
            // Configurar fuente para el nombre (más grande)
            ctx.font = 'bold 16px "Segoe UI", Tahoma, Geneva, Verdana, sans-serif';
            ctx.fillStyle = '#2f6c46';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            
            // Dibujar el nombre centrado en la parte superior
            const nameY = 10;
            ctx.fillText(name, width / 2, nameY);
            
            // Configurar fuente para la fecha (más pequeña)
            ctx.font = '12px "Segoe UI", Tahoma, Geneva, Verdana, sans-serif';
            ctx.fillStyle = '#333333';
            
            const now = new Date();
            const formattedDate = this.formatSimpleDate(now);
            
            // Dibujar la fecha debajo del nombre
            const dateY = nameY + 22;
            ctx.fillText(formattedDate, width / 2, dateY);
            
            const dataURL = canvas.toDataURL('image/png');
            resolve(dataURL);
        });
    }

    // NUEVO MÉTODO: Formato simple de fecha
    static formatSimpleDate(date) {
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        
        return `${day}/${month}/${year} ${hours}:${minutes}`;
    }

    // También actualiza este método para usar el nuevo formato
    static async createUserSignature(user) {
        try {
            const signatureData = await this.generateAutomaticSignature(user);
            
            return {
                data: signatureData,
                type: 'auto',
                fileName: `firma_${user.name.replace(/\s+/g, '_')}.png`,
                userName: user.name,
                userEmail: user.email,
                timestamp: new Date()
            };
        } catch (error) {
            console.error('Error al generar firma automática:', error);
            throw error;
        }
    }
}
// ===========================================
// CLASE DOCUMENT SERVICE COMPLETA Y MEJORADA
// ===========================================

// Sistema de Gestión de Documentos y Firmas
class DocumentService {
    static currentDocument = null;
    static currentZoom = 1.0;
    static isSignatureMode = false;
    static currentSignature = null;
    static documentSignatures = [];
    static pdfDocument = null; // cached pdf.js document
    static currentPage = 1;
    static totalPages = 1;
    static lastRenderTask = null;
    static isDraggingSignature = false;
    static isResizingSignature = false;
    static currentDraggingSignature = null;
    static canvasClickHandler = null;
    static canvasTouchEndHandler = null;
    static _oldClickHandler = null;
    static _oldTouchHandler = null;
    static touchStartX = 0;
    static touchStartY = 0;
    static lastTouchTime = 0;
    static isTouchDevice = 'ontouchstart' in window;

    // ===========================================
    // ALGORITMO MEJORADO: Detección de espacios específicos para documentos de formulario
    // ===========================================
    static async findSignaturePosition() {
        return new Promise(async (resolve, reject) => {
            try {
                console.log('🔍 BUSCANDO ESPACIOS DE FIRMA EN EL DOCUMENTO...');
                
                // USAR EL CANVAS PRINCIPAL (no el de análisis)
                const canvas = document.getElementById('documentCanvas');
                if (!canvas) {
                    console.log('❌ Canvas no disponible');
                    resolve({ x: 200, y: 200, fieldType: 'default', confidence: 0.1 });
                    return;
                }
                
                const ctx = canvas.getContext('2d');
                const width = canvas.width;
                const height = canvas.height;
                
                console.log(`📐 Tamaño del documento: ${width}x${height}`);
                
                // 1. INTENTAR BUSCAR LÍNEAS HORIZONTALES EN LA PARTE INFERIOR
                console.log('📏 Buscando líneas horizontales...');
                const lineSpots = await this.findHorizontalLinesSimple(ctx, width, height);
                
                if (lineSpots.length > 0) {
                    console.log(`✅ ${lineSpots.length} líneas encontradas`);
                    const bestLine = lineSpots[0];
                    resolve({
                        x: bestLine.x,
                        y: bestLine.y,
                        width: 90,
                        height: 36,
                        fieldType: 'horizontal_line',
                        confidence: 0.9,
                        reason: `Línea horizontal encontrada en Y=${bestLine.lineY}`
                    });
                    return;
                }
                
                // 2. BUSCAR ESPACIOS VACÍOS EN LA PARTE INFERIOR
                console.log('🔲 Buscando espacios vacíos...');
                const emptySpots = this.findEmptySpacesSimple(ctx, width, height);
                
                if (emptySpots.length > 0) {
                    console.log(`✅ ${emptySpots.length} espacios vacíos encontrados`);
                    const bestSpot = emptySpots[0];
                    resolve({
                        x: bestSpot.x,
                        y: bestSpot.y,
                        width: 90,
                        height: 36,
                        fieldType: 'empty_space',
                        confidence: 0.8,
                        reason: `Espacio vacío detectado (${bestSpot.emptyPercent}% vacío)`
                    });
                    return;
                }
                
                // 3. FALLBACK: USAR POSICIÓN BASADA EN TIPO DE DOCUMENTO
                console.log('📄 Usando posición por tipo de documento...');
                const fallbackPosition = this.getFallbackPositionByDocumentType(width, height);
                
                resolve({
                    x: fallbackPosition.x,
                    y: fallbackPosition.y,
                    width: 90,
                    height: 36,
                    fieldType: 'fallback',
                    confidence: 0.6,
                    reason: 'Posición basada en tipo de documento'
                });
                
            } catch (error) {
                console.error('❌ Error en findSignaturePosition:', error);
                // FALLBACK ABSOLUTO
                resolve({
                    x: 200,
                    y: 200,
                    width: 90,
                    height: 36,
                    fieldType: 'error_fallback',
                    confidence: 0.1,
                    reason: 'Error en análisis, usando posición predeterminada'
                });
            }
        });
    }

    static async findHorizontalLinesSimple(ctx, width, height) {
        const spots = [];
        
        try {
            // Obtener datos de imagen de la parte inferior (último 30%)
            const startY = Math.floor(height * 0.7);
            const endY = height - 10;
            
            // Escanear línea por línea
            for (let y = startY; y < endY; y++) {
                let darkPixels = 0;
                let totalPixels = 0;
                
                // Escanear una franja horizontal en el centro del documento
                const startX = Math.floor(width * 0.2);
                const endX = Math.floor(width * 0.8);
                
                for (let x = startX; x < endX; x++) {
                    try {
                        const pixel = ctx.getImageData(x, y, 1, 1).data;
                        const brightness = (pixel[0] + pixel[1] + pixel[2]) / 3;
                        
                        if (brightness < 100) { // Píxel oscuro
                            darkPixels++;
                        }
                        totalPixels++;
                    } catch (e) {
                        // Ignorar errores
                    }
                }
                
                // Si más del 60% de la línea es oscura, es probable que sea una línea de firma
                if (totalPixels > 0 && (darkPixels / totalPixels) > 0.6) {
                    // Verificar si hay espacio encima para la firma
                    const spaceAboveY = Math.max(0, y - 70);
                    let spaceEmpty = true;
                    
                    // Verificar espacio de 90x36px encima de la línea
                    for (let sy = spaceAboveY; sy < y && spaceEmpty; sy += 5) {
                        for (let sx = startX; sx < startX + 90 && sx < width; sx += 5) {
                            try {
                                const pixel = ctx.getImageData(sx, sy, 1, 1).data;
                                const brightness = (pixel[0] + pixel[1] + pixel[2]) / 3;
                                
                                if (brightness < 180) { // No está vacío
                                    spaceEmpty = false;
                                    break;
                                }
                            } catch (e) {
                                // Ignorar
                            }
                        }
                    }
                    
                    if (spaceEmpty) {
                        spots.push({
                            x: startX + 10,
                            y: spaceAboveY + 10,
                            lineY: y,
                            confidence: 0.9
                        });
                        
                        // Solo necesitamos la primera línea buena
                        break;
                    }
                }
            }
            
        } catch (error) {
            console.error('Error en findHorizontalLinesSimple:', error);
        }
        
        return spots;
    }
    
    static findEmptySpacesSimple(ctx, width, height) {
        const spots = [];
        
        try {
            // Buscar en la parte inferior derecha (zona más común para firmas)
            const searchArea = {
                x: Math.floor(width * 0.6), // 60% del ancho (derecha)
                y: Math.floor(height * 0.7), // 70% de la altura (inferior)
                width: Math.floor(width * 0.35), // 35% del ancho
                height: Math.floor(height * 0.25) // 25% de la altura
            };
            
            const cellSize = 20;
            const cellsX = Math.floor(searchArea.width / cellSize);
            const cellsY = Math.floor(searchArea.height / cellSize);
            
            for (let cellY = 0; cellY < cellsY; cellY++) {
                for (let cellX = 0; cellX < cellsX; cellX++) {
                    const x = searchArea.x + (cellX * cellSize);
                    const y = searchArea.y + (cellY * cellSize);
                    
                    // Verificar si esta celda está vacía
                    let emptyPixels = 0;
                    let totalPixels = 0;
                    
                    // Muestrear puntos dentro de la celda
                    for (let dy = 0; dy < cellSize; dy += 3) {
                        for (let dx = 0; dx < cellSize; dx += 3) {
                            const sampleX = x + dx;
                            const sampleY = y + dy;
                            
                            if (sampleX < width && sampleY < height) {
                                try {
                                    const pixel = ctx.getImageData(sampleX, sampleY, 1, 1).data;
                                    const brightness = (pixel[0] + pixel[1] + pixel[2]) / 3;
                                    
                                    if (brightness > 200) { // Blanco o casi blanco
                                        emptyPixels++;
                                    }
                                    totalPixels++;
                                } catch (e) {
                                    // Ignorar errores
                                }
                            }
                        }
                    }
                    
                    // Si más del 85% de los píxeles están vacíos, es un buen lugar
                    if (totalPixels > 5 && (emptyPixels / totalPixels) > 0.85) {
                        spots.push({
                            x: x + 5,
                            y: y + 5,
                            emptyPercent: Math.round((emptyPixels / totalPixels) * 100),
                            confidence: 0.8
                        });
                        
                        // Solo necesitamos el primer espacio bueno
                        if (spots.length >= 3) {
                            return spots;
                        }
                    }
                }
            }
            
        } catch (error) {
            console.error('Error en findEmptySpacesSimple:', error);
        }
        
        return spots;
    }
    
    static getFallbackPositionByDocumentType(width, height) {
        const aspectRatio = width / height;
        
        console.log(`📐 Proporción del documento: ${aspectRatio.toFixed(2)}`);
        
        // Posición por defecto: zona inferior del documento
        // Centro-derecha para documentos apaisados, centro para documentos verticales
        let x, y;
        
        if (aspectRatio > 1.5) {
            // Documento horizontal (apaisado) - firma en derecha
            x = width * 0.55;
            y = height * 0.8;
            console.log('📄 Documento apaisado - firma en derecha inferior');
        } else if (aspectRatio < 0.8) {
            // Documento vertical estrecho - firma centrada en izquierda
            x = width * 0.15;
            y = height * 0.8;
            console.log('📄 Documento vertical - firma en izquierda inferior');
        } else {
            // Documento estándar (A4) - firma en derecha pero centrada
            x = width * 0.55;
            y = height * 0.8;
            console.log('📄 Documento estándar - firma en derecha-centro inferior');
        }
        
        return { x, y };
    }



    static async comprehensivePixelAnalysis(canvas) {
        const spots = [];
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        
        // 1. ANÁLISIS DE LÍNEAS HORIZONTALES (ESCANEO LÍNEA POR LÍNEA)
        console.log('📏 Escaneando líneas horizontales...');
        const lineSpots = await this.analyzeHorizontalLinesPixelByPixel(ctx, width, height);
        spots.push(...lineSpots);
        
        // 2. DETECCIÓN DE TEXTO Y PALABRAS CLAVE
        console.log('🔤 Buscando texto y palabras clave...');
        const textSpots = await this.analyzeTextAndKeywords(ctx, width, height);
        spots.push(...textSpots);
        
        // 3. ANÁLISIS DE ESPACIOS EN BLANCO
        console.log('🔲 Analizando espacios vacíos...');
        const spaceSpots = this.analyzeWhiteSpacesPixelByPixel(ctx, width, height);
        spots.push(...spaceSpots);
        
        // 4. DETECCIÓN DE CUADROS Y TABLAS
        console.log('📋 Buscando cuadros y tablas...');
        const tableSpots = this.analyzeTablesAndBoxes(ctx, width, height);
        spots.push(...tableSpots);
        
        // 5. ANÁLISIS DE ZONAS ESTRUCTURALES
        console.log('🏗️ Analizando estructura del documento...');
        const structureSpots = this.analyzeDocumentStructure(ctx, width, height);
        spots.push(...structureSpots);
        
        return spots;
    }

    static async analyzeHorizontalLinesPixelByPixel(ctx, width, height) {
        const spots = [];
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;
        
        // CONCENTRARSE EN LA PARTE INFERIOR DEL DOCUMENTO (70% hacia abajo)
        const startY = Math.floor(height * 0.7);
        
        // ESCANEO LÍNEA POR LÍNEA
        for (let y = startY; y < height - 5; y++) {
            let lineStartX = -1;
            let consecutiveDarkPixels = 0;
            let maxConsecutive = 0;
            let maxStartX = -1;
            
            // ESCANEO PIXEL POR PIXEL EN ESTA LÍNEA
            for (let x = 0; x < width; x++) {
                const pixelIndex = (y * width + x) * 4;
                const r = data[pixelIndex];
                const g = data[pixelIndex + 1];
                const b = data[pixelIndex + 2];
                const brightness = (r + g + b) / 3;
                
                // VERIFICAR SI ES UN PIXEL OSCURO (POSIBLE LÍNEA)
                if (brightness < 100) {
                    if (lineStartX === -1) {
                        lineStartX = x;
                    }
                    consecutiveDarkPixels++;
                } else {
                    if (consecutiveDarkPixels > maxConsecutive) {
                        maxConsecutive = consecutiveDarkPixels;
                        maxStartX = lineStartX;
                    }
                    consecutiveDarkPixels = 0;
                    lineStartX = -1;
                }
            }
            
            // VERIFICAR LÍNEA AL FINAL DE LA LÍNEA
            if (consecutiveDarkPixels > maxConsecutive) {
                maxConsecutive = consecutiveDarkPixels;
                maxStartX = lineStartX;
            }
            
            // SI ENCONTRAMOS UNA LÍNEA SUFICIENTEMENTE LARGA (80-400px)
            if (maxConsecutive >= 80 && maxConsecutive <= 400) {
                // VERIFICAR SI ES UNA LÍNEA SÓLIDA (NO TEXTO DISPERSO)
                const isSolidLine = this.verifySolidLine(ctx, maxStartX, y, maxConsecutive);
                
                if (isSolidLine) {
                    // BUSCAR ESPACIO ENCIMA DE LA LÍNEA
                    const spaceAbove = this.findSpaceAboveLineDetailed(ctx, maxStartX, y, maxConsecutive, 70);
                    
                    if (spaceAbove) {
                        spots.push({
                            x: spaceAbove.x,
                            y: spaceAbove.y,
                            confidence: 0.92,
                            type: 'horizontal_line',
                            reason: `Línea horizontal de ${maxConsecutive}px encontrada`,
                            lineY: y,
                            lineLength: maxConsecutive
                        });
                    }
                }
            }
        }
        
        console.log(`📏 ${spots.length} líneas horizontales detectadas`);
        return spots;
    }

    static async analyzeTextAndKeywords(ctx, width, height) {
        const spots = [];
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;
        
        // PALABRAS CLAVE EN ESPAÑOL PARA FIRMAS
        const keywordsSpanish = [
            'firma', 'firmar', 'firmado', 'firmante',
            'nombre', 'apellido', 'cedula', 'c.c.',
            'documento', 'identificación', 'recibido',
            'entregado', 'aprobado', 'revisado', 'acepto',
            'conforme', 'contrato', 'acuerdo', 'fecha',
            'lugar', 'testigo', 'notaría', 'registro'
        ];
        
        // PALABRAS CLAVE EN INGLÉS (POR SI ACASO)
        const keywordsEnglish = [
            'signature', 'sign', 'signed', 'name',
            'date', 'witness', 'approved', 'received',
            'document', 'contract', 'agreement'
        ];
        
        const allKeywords = [...keywordsSpanish, ...keywordsEnglish];
        
        // DIVIDIR EL DOCUMENTO EN CELDAS PARA ANÁLISIS
        const cellSize = 50;
        const cols = Math.ceil(width / cellSize);
        const rows = Math.ceil(height / cellSize);
        
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const x = col * cellSize;
                const y = row * cellSize;
                
                // ANALIZAR ESTA CELDA PARA TEXTO
                const cellText = await this.analyzeCellForText(ctx, x, y, cellSize, cellSize);
                
                if (cellText) {
                    // VERIFICAR PALABRAS CLAVE EN EL TEXTO DETECTADO
                    for (const keyword of allKeywords) {
                        if (cellText.toLowerCase().includes(keyword.toLowerCase())) {
                            console.log(`🔤 Palabra clave "${keyword}" detectada cerca de (${x}, ${y})`);
                            
                            // BUSCAR ESPACIOS ALREDEDOR DE ESTA PALABRA CLAVE
                            const surroundingSpaces = this.findSpacesAroundPoint(ctx, x, y, cellSize);
                            
                            surroundingSpaces.forEach(space => {
                                spots.push({
                                    x: space.x,
                                    y: space.y,
                                    confidence: 0.88,
                                    type: 'keyword_based',
                                    reason: `Cerca de palabra clave: "${keyword}"`,
                                    keyword: keyword,
                                    distance: space.distance
                                });
                            });
                        }
                    }
                }
            }
        }
        
        console.log(`🔤 ${spots.length} ubicaciones basadas en palabras clave`);
        return spots;
    }

    static analyzeWhiteSpacesPixelByPixel(ctx, width, height) {
        const spots = [];
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;
        
        // TAMAÑO MÍNIMO PARA UNA FIRMA
        const minWidth = 120;
        const minHeight = 50;
        
        // BUSCAR EN LA PARTE INFERIOR (ÚLTIMO 40% DEL DOCUMENTO)
        const startY = Math.floor(height * 0.6);
        
        // ESCANEO SISTEMÁTICO
        for (let y = startY; y < height - minHeight; y += 20) {
            for (let x = 0; x < width - minWidth; x += 20) {
                
                // VERIFICAR SI ESTA ÁREA ESTÁ MAYORMENTE VACÍA
                let whitePixels = 0;
                let totalPixels = 0;
                
                for (let dy = 0; dy < minHeight && y + dy < height; dy += 4) {
                    for (let dx = 0; dx < minWidth && x + dx < width; dx += 4) {
                        const pixelIndex = ((y + dy) * width + (x + dx)) * 4;
                        const r = data[pixelIndex];
                        const g = data[pixelIndex + 1];
                        const b = data[pixelIndex + 2];
                        const brightness = (r + g + b) / 3;
                        
                        if (brightness > 220) { // BLANCO O CASI BLANCO
                            whitePixels++;
                        }
                        totalPixels++;
                    }
                }
                
                // SI MÁS DEL 90% ES BLANCO, ES UN ESPACIO VÁLIDO
                if (totalPixels > 0 && (whitePixels / totalPixels) > 0.9) {
                    // VERIFICAR QUE NO ESTÉ DEMASIADO CERCA DE LOS BORDES
                    const isTooCloseToEdge = x < 20 || x > width - minWidth - 20 || 
                                            y < 20 || y > height - minHeight - 20;
                    
                    if (!isTooCloseToEdge) {
                        spots.push({
                            x: x + 5,
                            y: y + 5,
                            confidence: 0.75,
                            type: 'white_space',
                            reason: `Espacio vacío detectado (${Math.round((whitePixels/totalPixels)*100)}% blanco)`,
                            width: minWidth - 10,
                            height: minHeight - 10
                        });
                    }
                }
            }
        }
        
        console.log(`🔲 ${spots.length} espacios vacíos detectados`);
        return spots;
    }

    // MÉTODOS AUXILIARES PARA EL ANÁLISIS PIXEL POR PIXEL

    static verifySolidLine(ctx, startX, y, length) {
        // VERIFICAR QUE SEA UNA LÍNEA SÓLIDA Y NO TEXTO DISPERSO
        let solidCount = 0;
        const samplePoints = Math.min(20, Math.floor(length / 5));
        
        for (let i = 0; i < samplePoints; i++) {
            const x = startX + Math.floor((i / samplePoints) * length);
            
            // VERIFICAR VARIOS PÍXELES VERTICALMENTE (GROSOR DE LÍNEA)
            let columnSolid = false;
            for (let dy = -2; dy <= 2; dy++) {
                try {
                    const pixel = ctx.getImageData(x, y + dy, 1, 1).data;
                    const brightness = (pixel[0] + pixel[1] + pixel[2]) / 3;
                    
                    if (brightness < 120) {
                        columnSolid = true;
                        break;
                    }
                } catch (e) {
                    // IGNORAR ERRORES DE LÍMITES
                }
            }
            
            if (columnSolid) solidCount++;
        }
        
        return solidCount >= samplePoints * 0.7; // 70% DE PUNTOS SÓLIDOS
    }

    static findSpaceAboveLineDetailed(ctx, lineX, lineY, lineLength, maxHeight) {
        const searchHeight = Math.min(maxHeight, lineY);
        let bestY = lineY - 15;
        let spaceFound = false;
        
        // ESCANEAR HACIA ARRIBA PIXEL POR PIXEL
        for (let y = lineY - 1; y >= lineY - searchHeight; y--) {
            let hasContent = false;
            
            // VERIFICAR UNA FRANJA HORIZONTAL
            for (let x = lineX; x < lineX + lineLength; x += 3) {
                try {
                    const pixel = ctx.getImageData(x, y, 1, 1).data;
                    const brightness = (pixel[0] + pixel[1] + pixel[2]) / 3;
                    
                    if (brightness < 200) { // NO ES BLANCO PURO
                        hasContent = true;
                        break;
                    }
                } catch (e) {
                    // IGNORAR ERRORES
                }
            }
            
            if (hasContent) {
                // ENCONTRAMOS CONTENIDO, USAR LA LÍNEA ANTERIOR COMO ESPACIO
                bestY = y + 8;
                spaceFound = true;
                break;
            }
        }
        
        if (!spaceFound) {
            bestY = lineY - 25;
        }
        
        // ASEGURAR QUE NO SEA NEGATIVO
        bestY = Math.max(15, bestY);
        
        return {
            x: lineX + (lineLength / 2) - 60, // CENTRAR LA FIRMA
            y: bestY
        };
    }

    static async analyzeCellForText(ctx, x, y, width, height) {
        // MÉTODO SIMPLIFICADO PARA DETECTAR TEXTO
        // EN UNA IMPLEMENTACIÓN REAL, ESTO PODRÍA USAR OCR
        
        let darkPixels = 0;
        let totalPixels = 0;
        
        for (let dy = 0; dy < height && y + dy < ctx.canvas.height; dy += 2) {
            for (let dx = 0; dx < width && x + dx < ctx.canvas.width; dx += 2) {
                try {
                    const pixel = ctx.getImageData(x + dx, y + dy, 1, 1).data;
                    const brightness = (pixel[0] + pixel[1] + pixel[2]) / 3;
                    
                    if (brightness < 180) {
                        darkPixels++;
                    }
                    totalPixels++;
                } catch (e) {
                    // IGNORAR ERRORES
                }
            }
        }
        
        // SI HAY SUFICIENTES PÍXELES OSCUROS, PROBABLEMENTE HAY TEXTO
        if (totalPixels > 10 && (darkPixels / totalPixels) > 0.2) {
            return "texto detectado";
        }
        
        return null;
    }

    static findSpacesAroundPoint(ctx, x, y, radius) {
        const spaces = [];
        
        // DIRECCIONES POSIBLES (EN RADIANES)
        const directions = [
            { angle: 0, name: 'derecha' },      // DERECHA
            { angle: Math.PI / 2, name: 'abajo' },  // ABAJO
            { angle: Math.PI / 4, name: 'diagonal' } // DIAGONAL INFERIOR DERECHA
        ];
        
        for (const dir of directions) {
            const targetX = x + Math.cos(dir.angle) * radius;
            const targetY = y + Math.sin(dir.angle) * radius;
            
            // VERIFICAR SI EL ÁREA ESTÁ VACÍA
            if (this.isAreaEmptyDetailed(ctx, targetX, targetY, 120, 50)) {
                spaces.push({
                    x: targetX + 5,
                    y: targetY + 5,
                    distance: radius,
                    direction: dir.name
                });
            }
        }
        
        return spaces;
    }

    static isAreaEmptyDetailed(ctx, x, y, width, height, threshold = 0.85) {
        try {
            if (x < 0 || y < 0 || x + width > ctx.canvas.width || y + height > ctx.canvas.height) {
                return false;
            }
            
            let whitePixels = 0;
            let totalPixels = 0;
            
            for (let dy = 0; dy < height; dy += 3) {
                for (let dx = 0; dx < width; dx += 3) {
                    const pixel = ctx.getImageData(x + dx, y + dy, 1, 1).data;
                    const brightness = (pixel[0] + pixel[1] + pixel[2]) / 3;
                    
                    if (brightness > 230) { // BLANCO PURO
                        whitePixels++;
                    }
                    totalPixels++;
                }
            }
            
            return totalPixels > 0 && (whitePixels / totalPixels) >= threshold;
            
        } catch (error) {
            return false;
        }
    }

    static analyzeTablesAndBoxes(ctx, width, height) {
        const spots = [];
        
        // BUSCAR CUADROS Y TABLAS EN LA PARTE INFERIOR
        const bottomArea = {
            x: 0,
            y: height * 0.7,
            width: width,
            height: height * 0.3
        };
        
        // BUSCAR LÍNEAS VERTICALES Y HORIZONTALES QUE FORMAN CUADROS
        const gridSpacing = 30;
        
        for (let y = bottomArea.y; y < bottomArea.y + bottomArea.height; y += gridSpacing) {
            for (let x = 0; x < bottomArea.width; x += gridSpacing) {
                // VERIFICAR SI HAY UN CUADRO EN ESTA POSICIÓN
                const hasBox = this.detectBoxAtPosition(ctx, x, y, 90, 36);
                
                if (hasBox) {
                    // EL CENTRO DEL CUADRO ES BUEN LUGAR PARA UNA FIRMA
                    spots.push({
                        x: x + 75 - 60, // CENTRAR
                        y: y + 30 - 25,
                        confidence: 0.8,
                        type: 'box_detected',
                        reason: 'Cuadro o tabla detectada'
                    });
                }
            }
        }
        
        console.log(`📋 ${spots.length} cuadros/tablas detectados`);
        return spots;
    }

    static analyzeDocumentStructure(ctx, width, height) {
        const spots = [];
        
        // ZONAS ESTRUCTURALES COMUNES PARA FIRMAS
        const structuralZones = [
            {
                name: 'bottom_right_corner',
                x: width * 0.75,
                y: height * 0.85,
                confidence: 0.9,
                reason: 'Esquina inferior derecha (zona común)'
            },
            {
                name: 'bottom_left_corner',
                x: width * 0.15,
                y: height * 0.85,
                confidence: 0.8,
                reason: 'Esquina inferior izquierda'
            },
            {
                name: 'center_bottom',
                x: width * 0.4,
                y: height * 0.9,
                confidence: 0.7,
                reason: 'Centro inferior del documento'
            },
            {
                name: 'right_margin',
                x: width * 0.8,
                y: height * 0.5,
                confidence: 0.6,
                reason: 'Margen derecho central'
            },
            {
                name: 'left_margin',
                x: width * 0.1,
                y: height * 0.5,
                confidence: 0.6,
                reason: 'Margen izquierdo central'
            }
        ];
        
        // VERIFICAR CADA ZONA PARA CONTENIDO
        structuralZones.forEach(zone => {
            // VERIFICAR SI LA ZONA ESTÁ RELATIVAMENTE VACÍA
            const isEmpty = this.isAreaEmptyDetailed(ctx, zone.x, zone.y, 90, 36, 0.7);
            
            if (isEmpty) {
                spots.push({
                    x: zone.x,
                    y: zone.y,
                    confidence: zone.confidence,
                    type: 'structural_zone',
                    reason: zone.reason
                });
            }
        });
        
        console.log(`🏗️ ${spots.length} zonas estructurales identificadas`);
        return spots;
    }

    static detectBoxAtPosition(ctx, x, y, width, height) {
        // VERIFICAR LÍNEAS HORIZONTALES SUPERIOR E INFERIOR
        let topLine = 0, bottomLine = 0, leftLine = 0, rightLine = 0;
        const samplePoints = 10;
        
        // LÍNEA SUPERIOR
        for (let i = 0; i < samplePoints; i++) {
            const sampleX = x + (i / samplePoints) * width;
            try {
                const pixel = ctx.getImageData(sampleX, y, 1, 1).data;
                const brightness = (pixel[0] + pixel[1] + pixel[2]) / 3;
                if (brightness < 150) topLine++;
            } catch (e) {}
        }
        
        // LÍNEA INFERIOR
        for (let i = 0; i < samplePoints; i++) {
            const sampleX = x + (i / samplePoints) * width;
            try {
                const pixel = ctx.getImageData(sampleX, y + height, 1, 1).data;
                const brightness = (pixel[0] + pixel[1] + pixel[2]) / 3;
                if (brightness < 150) bottomLine++;
            } catch (e) {}
        }
        
        // LÍNEA IZQUIERDA
        for (let i = 0; i < samplePoints; i++) {
            const sampleY = y + (i / samplePoints) * height;
            try {
                const pixel = ctx.getImageData(x, sampleY, 1, 1).data;
                const brightness = (pixel[0] + pixel[1] + pixel[2]) / 3;
                if (brightness < 150) leftLine++;
            } catch (e) {}
        }
        
        // LÍNEA DERECHA
        for (let i = 0; i < samplePoints; i++) {
            const sampleY = y + (i / samplePoints) * height;
            try {
                const pixel = ctx.getImageData(x + width, sampleY, 1, 1).data;
                const brightness = (pixel[0] + pixel[1] + pixel[2]) / 3;
                if (brightness < 150) rightLine++;
            } catch (e) {}
        }
        
        // SI TENEMOS AL MENOS 3 LÍNEAS, PROBABLEMENTE ES UN CUADRO
        const lineCount = [topLine, bottomLine, leftLine, rightLine].filter(count => count > 5).length;
        return lineCount >= 3;
    }

    static removeDuplicateSpots(spots, minDistance = 30) {
        const uniqueSpots = [];
        
        for (const spot of spots) {
            let isDuplicate = false;
            
            for (const uniqueSpot of uniqueSpots) {
                const distance = Math.sqrt(
                    Math.pow(spot.x - uniqueSpot.x, 2) + 
                    Math.pow(spot.y - uniqueSpot.y, 2)
                );
                
                if (distance < minDistance) {
                    isDuplicate = true;
                    // MANTENER EL SPOT CON MAYOR CONFIANZA
                    if (spot.confidence > uniqueSpot.confidence) {
                        const index = uniqueSpots.indexOf(uniqueSpot);
                        uniqueSpots[index] = spot;
                    }
                    break;
                }
            }
            
            if (!isDuplicate) {
                uniqueSpots.push(spot);
            }
        }
        
        return uniqueSpots;
    }

    static filterOccupiedSpots(signatureSpots) {
        if (this.documentSignatures.length === 0) {
            return signatureSpots;
        }
        
        return signatureSpots.filter(spot => {
            for (const sig of this.documentSignatures) {
                const sigX = sig.x;
                const sigY = sig.y;
                const sigWidth = sig.width || 90;
                const sigHeight = sig.height || 36;
                
                const spotX = spot.x;
                const spotY = spot.y;
                const spotWidth = spot.width || 90;
                const spotHeight = spot.height || 36;
                
                // VERIFICAR SUPERPOSICIÓN
                const overlap = !(spotX + spotWidth < sigX ||
                                spotX > sigX + sigWidth ||
                                spotY + spotHeight < sigY ||
                                spotY > sigY + sigHeight);
                
                if (overlap) {
                    return false;
                }
            }
            return true;
        });
    }

    // MÉTODO PARA BUSCAR ESPACIO LEJOS DE FIRMAS EXISTENTES
    static async findSpaceAwayFromSignatures(canvas) {
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        
        // BUSCAR EN DIFERENTES ZONAS DEL DOCUMENTO
        const searchZones = [
            { x: width * 0.1, y: height * 0.1, name: 'top_left' },
            { x: width * 0.3, y: height * 0.3, name: 'center_left' },
            { x: width * 0.5, y: height * 0.5, name: 'center' },
            { x: width * 0.7, y: height * 0.3, name: 'center_right' },
            { x: width * 0.1, y: height * 0.7, name: 'bottom_left' },
            { x: width * 0.5, y: height * 0.7, name: 'bottom_center' }
            // NOTA: NO INCLUIMOS LA ESQUINA INFERIOR DERECHA
        ];
        
        for (const zone of searchZones) {
            // VERIFICAR SI EL ÁREA ESTÁ VACÍA
            let isEmpty = true;
            for (let dy = 0; dy < 60; dy += 10) {
                for (let dx = 0; dx < 90; dx += 10) {
                    const x = zone.x + dx;
                    const y = zone.y + dy;
                    
                    if (x < width && y < height) {
                        const pixel = ctx.getImageData(x, y, 1, 1).data;
                        const brightness = (pixel[0] + pixel[1] + pixel[2]) / 3;
                        
                        if (brightness < 200) { // NO ESTÁ VACÍO
                            isEmpty = false;
                            break;
                        }
                    }
                }
                if (!isEmpty) break;
            }
            
            // VERIFICAR QUE NO ESTÉ CERCA DE FIRMAS EXISTENTES
            let isFarFromSignatures = true;
            for (const sig of this.documentSignatures) {
                const distance = Math.sqrt(
                    Math.pow(zone.x - sig.x, 2) + 
                    Math.pow(zone.y - sig.y, 2)
                );
                
                if (distance < 100) {
                    isFarFromSignatures = false;
                    break;
                }
            }
            
            if (isEmpty && isFarFromSignatures) {
                console.log(`✅ Espacio encontrado en zona ${zone.name}`);
                return {
                    x: zone.x,
                    y: zone.y,
                    fieldType: 'away_from_signatures',
                    confidence: 0.7,
                    reason: `Espacio lejos de firmas existentes (${zone.name})`
                };
            }
        }
        
        return null;
    }

    // ANÁLISIS ALTERNATIVO DE ESTRUCTURA DEL DOCUMENTO
    static async analyzeDocumentStructure(canvas) {
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        
        console.log('🏗️ Analizando estructura del documento...');
        
        // BUSCAR GRANDES ÁREAS VACÍAS
        const largeEmptyAreas = this.findLargeEmptyAreas(ctx, width, height);
        
        if (largeEmptyAreas.length > 0) {
            const bestArea = largeEmptyAreas[0];
            console.log(`✅ Área grande vacía encontrada: (${bestArea.x}, ${bestArea.y})`);
            return {
                x: bestArea.x,
                y: bestArea.y,
                fieldType: 'large_empty_area',
                confidence: 0.8,
                reason: `Área grande vacía (${bestArea.width}x${bestArea.height})`
            };
        }
        
        return null;
    }

    static findLargeEmptyAreas(ctx, width, height) {
        const areas = [];
        const minAreaWidth = 200;
        const minAreaHeight = 100;
        
        // BUSCAR EN TODO EL DOCUMENTO
        for (let y = 0; y < height - minAreaHeight; y += 20) {
            for (let x = 0; x < width - minAreaWidth; x += 20) {
                let isEmpty = true;
                
                // VERIFICAR EL ÁREA
                for (let dy = 0; dy < minAreaHeight; dy += 5) {
                    for (let dx = 0; dx < minAreaWidth; dx += 5) {
                        const pixel = ctx.getImageData(x + dx, y + dy, 1, 1).data;
                        const brightness = (pixel[0] + pixel[1] + pixel[2]) / 3;
                        
                        if (brightness < 230) {
                            isEmpty = false;
                            break;
                        }
                    }
                    if (!isEmpty) break;
                }
                
                if (isEmpty) {
                    areas.push({
                        x: x + 10,
                        y: y + 10,
                        width: minAreaWidth - 20,
                        height: minAreaHeight - 20
                    });
                }
            }
        }
        
        return areas;
    }
    
    // BÚSQUEDA DE EMERGENCIA
    static async emergencySpaceSearch() {
        const canvas = document.getElementById('documentCanvas');
        if (!canvas) return null;
        
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        
        console.log('🚨 BÚSQUEDA DE EMERGENCIA DE ESPACIOS...');
        
        // ESCANEAR SISTEMÁTICAMENTE TODO EL DOCUMENTO
        for (let y = 0; y < height - 36; y += 10) {
            for (let x = 0; x < width - 90; x += 10) {
                let emptyCount = 0;
                let totalCount = 0;
                
                // VERIFICAR 10 PUNTOS ALEATORIOS EN EL ÁREA
                for (let i = 0; i < 10; i++) {
                    const rx = x + Math.floor(Math.random() * 90);
                    const ry = y + Math.floor(Math.random() * 36);
                    
                    if (rx < width && ry < height) {
                        const pixel = ctx.getImageData(rx, ry, 1, 1).data;
                        const brightness = (pixel[0] + pixel[1] + pixel[2]) / 3;
                        
                        if (brightness > 200) {
                            emptyCount++;
                        }
                        totalCount++;
                    }
                }
                
                if (totalCount > 0 && (emptyCount / totalCount) > 0.8) {
                    console.log(`✅ Espacio de emergencia encontrado: (${x}, ${y})`);
                    return {
                        x: x + 5,
                        y: y + 5,
                        fieldType: 'emergency_search',
                        confidence: 0.5,
                        reason: 'Encontrado en búsqueda de emergencia'
                    };
                }
            }
        }
        
        return null;
    }

    // MÉTODO PARA DIBUJAR MARCAS DE DEPURACIÓN (OPCIONAL)
    static drawDebugMarkers(canvas, spots) {
        const ctx = canvas.getContext('2d');
        
        spots.forEach((spot, index) => {
            // DIBUJAR UN CÍRCULO EN EL PUNTO
            ctx.beginPath();
            ctx.arc(spot.x, spot.y, 8, 0, Math.PI * 2);
            ctx.fillStyle = index === 0 ? '#00ff00' : '#ffff00';
            ctx.fill();
            
            // DIBUJAR TEXTO
            ctx.fillStyle = '#000000';
            ctx.font = '12px Arial';
            ctx.fillText(`${index + 1}`, spot.x - 4, spot.y + 4);
            
            // DIBUJAR RECTÁNGULO DEL ESPACIO
            ctx.strokeStyle = index === 0 ? '#00ff00' : '#ffff00';
            ctx.lineWidth = 2;
            ctx.strokeRect(
                spot.x - (spot.width || 90) / 2,
                spot.y - (spot.height || 36) / 2,
                spot.width || 90,
                spot.height || 36
            );
        });
        
        console.log('🎨 Marcas de depuración dibujadas en el canvas de análisis');
    }


    // ===========================================
    // NUEVO: Buscar líneas de firma (ALGORITMO PRINCIPAL)
    // ===========================================
    static async findSignatureLines(ctx, width, height) {
        try {
            console.log('📏 Escaneando líneas en documento...');
            
            // Concentrar búsqueda en la parte inferior (70% - 95% de altura)
            const searchStartY = height * 0.7;
            const searchEndY = height * 0.95;
            const searchStartX = width * 0.1;
            const searchEndX = width * 0.9;
            
            console.log(`🔍 Zona de búsqueda: Y=${searchStartY.toFixed(0)}-${searchEndY.toFixed(0)}, X=${searchStartX.toFixed(0)}-${searchEndX.toFixed(0)}`);
            
            const foundLines = [];
            const lineScanStep = 2; // Escanear cada 2px en Y
            
            // 1. Escanear para encontrar líneas horizontales
            for (let y = searchStartY; y < searchEndY; y += lineScanStep) {
                let linePixels = 0;
                let lineStartX = 0;
                let maxLineLength = 0;
                let maxLineStartX = 0;
                
                for (let x = searchStartX; x < searchEndX; x++) {
                    // Obtener pixel
                    const pixel = ctx.getImageData(x, y, 1, 1).data;
                    
                    // Calcular brillo (0-255)
                    const brightness = (pixel[0] + pixel[1] + pixel[2]) / 3;
                    
                    // Si el pixel es oscuro (probablemente parte de una línea)
                    if (brightness < 150) {
                        if (linePixels === 0) {
                            lineStartX = x;
                        }
                        linePixels++;
                    } else {
                        if (linePixels > maxLineLength) {
                            maxLineLength = linePixels;
                            maxLineStartX = lineStartX;
                        }
                        linePixels = 0;
                    }
                }
                
                // Verificar si encontramos una línea al final del scan
                if (linePixels > maxLineLength) {
                    maxLineLength = linePixels;
                    maxLineStartX = lineStartX;
                }
                
                // Si la línea tiene un largo razonable (80-300px es típico para firma)
                if (maxLineLength >= 80 && maxLineLength <= 300) {
                    console.log(`📏 Línea encontrada en Y=${y}, longitud=${maxLineLength}px`);
                    
                    // Verificar si hay espacio encima para poner la firma
                    const spaceAbove = this.checkSpaceAboveLine(ctx, maxLineStartX, y, maxLineLength, 70);
                    
                    if (spaceAbove.found) {
                        foundLines.push({
                            x: spaceAbove.x,
                            y: spaceAbove.y,
                            lineY: y,
                            lineLength: maxLineLength,
                            score: maxLineLength // Líneas más largas tienen más puntuación
                        });
                    }
                }
            }
            
            // Ordenar líneas por posición Y (más abajo = mejor para firmas)
            foundLines.sort((a, b) => b.lineY - a.lineY);
            
            // Tomar la mejor línea (la más baja que tenga buen espacio)
            if (foundLines.length > 0) {
                const bestLine = foundLines[0];
                console.log(`🎯 MEJOR LÍNEA: Y=${bestLine.lineY}, X=${bestLine.x}`);
                return {
                    found: true,
                    x: bestLine.x,
                    y: bestLine.y,
                    lineY: bestLine.lineY,
                    lineLength: bestLine.lineLength
                };
            }
            
            console.log('❌ No se encontraron líneas adecuadas');
            return { found: false };
            
        } catch (error) {
            console.error('Error en findSignatureLines:', error);
            return { found: false };
        }
    }

    // ===========================================
    // NUEVO: Buscar espacios vacíos para firma
    // ===========================================
    static async findEmptySignatureSpots(ctx, width, height) {
        try {
            console.log('🔲 Buscando espacios vacíos...');
            
            // Definir zonas donde comúnmente van las firmas
            const signatureZones = [
                // Zona inferior derecha (más común)
                { x: width * 0.65, y: height * 0.8, w: 180, h: 60, name: 'bottom_right' },
                // Zona inferior izquierda (segunda más común)
                { x: width * 0.15, y: height * 0.8, w: 180, h: 60, name: 'bottom_left' },
                // Zona centro inferior
                { x: width * 0.4, y: height * 0.85, w: 180, h: 60, name: 'center_bottom' },
                // Zona derecha media
                { x: width * 0.7, y: height * 0.5, w: 180, h: 60, name: 'right_middle' },
                // Zona izquierda media
                { x: width * 0.1, y: height * 0.5, w: 180, h: 60, name: 'left_middle' }
            ];
            
            // Verificar cada zona
            for (const zone of signatureZones) {
                console.log(`🔍 Probando zona: ${zone.name} (${zone.x}, ${zone.y})`);
                
                const isEmpty = this.isAreaTrulyEmpty(ctx, zone.x, zone.y, zone.w, zone.h);
                
                if (isEmpty) {
                    console.log(`✅ Zona ${zone.name} está vacía!`);
                    return {
                        found: true,
                        x: zone.x + 10,
                        y: zone.y + 10,
                        zone: zone.name
                    };
                }
            }
            
            // Si ninguna zona predefinida está vacía, buscar en toda la parte inferior
            console.log('🔍 Escaneando toda la parte inferior del documento...');
            
            const bottomScanY = height * 0.7;
            const bottomScanHeight = height * 0.25;
            const scanStep = 20;
            
            for (let y = bottomScanY; y < bottomScanY + bottomScanHeight; y += scanStep) {
                for (let x = 50; x < width - 200; x += scanStep) {
                    // Verificar área de 90x36px
                    if (this.isAreaTrulyEmpty(ctx, x, y, 90, 36)) {
                        console.log(`✅ Espacio encontrado en (${x}, ${y})`);
                        return {
                            found: true,
                            x: x + 10,
                            y: y + 10,
                            zone: 'scanned_bottom'
                        };
                    }
                }
            }
            
            console.log('❌ No se encontraron espacios vacíos');
            return { found: false };
            
        } catch (error) {
            console.error('Error en findEmptySignatureSpots:', error);
            return { found: false };
        }
    }

    // ===========================================
    // NUEVO: Verificar si área está realmente vacía (más preciso)
    // ===========================================
    static isAreaTrulyEmpty(ctx, x, y, width, height) {
        try {
            // Ajustar coordenadas para no salirse del canvas
            const safeX = Math.max(0, Math.floor(x));
            const safeY = Math.max(0, Math.floor(y));
            const safeWidth = Math.min(Math.floor(width), ctx.canvas.width - safeX);
            const safeHeight = Math.min(Math.floor(height), ctx.canvas.height - safeY);
            
            if (safeWidth <= 0 || safeHeight <= 0) {
                return false;
            }
            
            let darkPixels = 0;
            let totalPixels = 0;
            const sampleStep = 3; // Muestrear cada 3px
            
            // Escanear el área
            for (let sy = safeY; sy < safeY + safeHeight; sy += sampleStep) {
                for (let sx = safeX; sx < safeX + safeWidth; sx += sampleStep) {
                    try {
                        const pixel = ctx.getImageData(sx, sy, 1, 1).data;
                        const brightness = (pixel[0] + pixel[1] + pixel[2]) / 3;
                        
                        // Si el píxel es oscuro (menos de 180 de brillo)
                        if (brightness < 180) {
                            darkPixels++;
                        }
                        totalPixels++;
                    } catch (e) {
                        // Ignorar errores de píxeles fuera de límites
                    }
                }
            }
            
            // Calcular porcentaje de píxeles oscuros
            const darkPercentage = totalPixels > 0 ? (darkPixels / totalPixels) * 100 : 100;
            
            // Considerar vacío si menos del 10% de píxeles son oscuros
            const isEmpty = darkPercentage < 10;
            
            if (isEmpty) {
                console.log(`   ✅ Área (${x},${y}) - ${width}x${height}: ${darkPercentage.toFixed(1)}% oscuro (VACÍO)`);
            } else {
                console.log(`   ❌ Área (${x},${y}) - ${width}x${height}: ${darkPercentage.toFixed(1)}% oscuro (OCUPADO)`);
            }
            
            return isEmpty;
            
        } catch (error) {
            console.error('Error en isAreaTrulyEmpty:', error);
            return false;
        }
    }

    // ===========================================
    // NUEVO: Analizar densidad de píxeles
    // ===========================================
    static async analyzePixelDensity(ctx, width, height) {
        try {
            console.log('📊 Analizando densidad de píxeles...');
            
            // Dividir la parte inferior del documento en una cuadrícula
            const gridSize = 8;
            const cellWidth = Math.floor(width / gridSize);
            const cellHeight = Math.floor(height * 0.3 / gridSize); // Solo parte inferior 30%
            const startY = height * 0.7;
            
            let bestCell = null;
            let bestDensity = Infinity; // Buscamos la menor densidad (más vacío)
            
            // Analizar cada celda
            for (let row = 0; row < gridSize; row++) {
                for (let col = 0; col < gridSize; col++) {
                    const cellX = col * cellWidth;
                    const cellY = startY + (row * cellHeight);
                    
                    // Calcular densidad de píxeles oscuros en esta celda
                    const density = this.calculatePixelDensity(ctx, cellX, cellY, cellWidth, cellHeight);
                    
                    if (density < bestDensity) {
                        bestDensity = density;
                        bestCell = { x: cellX, y: cellY, width: cellWidth, height: cellHeight, density: density };
                    }
                }
            }
            
            // Si encontramos una celda con baja densidad
            if (bestCell && bestDensity < 15) { // Menos del 15% de densidad
                console.log(`✅ Mejor celda: (${bestCell.x}, ${bestCell.y}) - densidad: ${bestDensity.toFixed(1)}%`);
                
                // Encontrar posición dentro de la celda
                const position = this.findBestPositionInCell(ctx, bestCell);
                
                if (position.found) {
                    return {
                        found: true,
                        x: position.x,
                        y: position.y,
                        density: bestDensity
                    };
                }
            }
            
            console.log('❌ No se encontraron celdas con baja densidad');
            return { found: false };
            
        } catch (error) {
            console.error('Error en analyzePixelDensity:', error);
            return { found: false };
        }
    }

    // ===========================================
    // NUEVO: Calcular densidad de píxeles
    // ===========================================
    static calculatePixelDensity(ctx, x, y, width, height) {
        try {
            let darkPixels = 0;
            let totalPixels = 0;
            const sampleStep = 4;
            
            for (let sy = y; sy < y + height && sy < ctx.canvas.height; sy += sampleStep) {
                for (let sx = x; sx < x + width && sx < ctx.canvas.width; sx += sampleStep) {
                    const pixel = ctx.getImageData(sx, sy, 1, 1).data;
                    const brightness = (pixel[0] + pixel[1] + pixel[2]) / 3;
                    
                    if (brightness < 180) {
                        darkPixels++;
                    }
                    totalPixels++;
                }
            }
            
            return totalPixels > 0 ? (darkPixels / totalPixels) * 100 : 100;
            
        } catch (error) {
            return 100; // Máxima densidad si hay error
        }
    }

    // ===========================================
    // NUEVO: Encontrar mejor posición dentro de una celda
    // ===========================================
    static findBestPositionInCell(ctx, cell) {
        try {
            // Intentar diferentes posiciones dentro de la celda
            const positions = [
                { x: cell.x + 20, y: cell.y + 20 },
                { x: cell.x + cell.width - 170, y: cell.y + 20 },
                { x: cell.x + cell.width / 2 - 75, y: cell.y + cell.height / 2 - 30 }
            ];
            
            for (const pos of positions) {
                // Verificar si hay espacio para una firma
                if (this.isAreaTrulyEmpty(ctx, pos.x, pos.y, 110, 45)) {
                    return {
                        found: true,
                        x: pos.x,
                        y: pos.y
                    };
                }
            }
            
            return { found: false };
            
        } catch (error) {
            console.error('Error en findBestPositionInCell:', error);
            return { found: false };
        }
    }

    // ===========================================
    // NUEVO: Verificar espacio encima de línea
    // ===========================================
    static checkSpaceAboveLine(ctx, lineX, lineY, lineLength, spaceHeight) {
        try {
            const spaceWidth = lineLength;
            const startX = lineX;
            const startY = Math.max(0, lineY - spaceHeight);
            
            // Verificar si el área está vacía
            if (this.isAreaTrulyEmpty(ctx, startX, startY, spaceWidth, spaceHeight)) {
                return {
                    found: true,
                    x: startX + (spaceWidth / 2) - 45, // Centrar la firma
                    y: startY + 10
                };
            }
        } catch (error) {
            console.error('Error en checkSpaceAboveLine:', error);
        }
        
        return { found: false };
    }

    // ===========================================
    // NUEVO: Fallback basado en tipo de documento
    // ===========================================
    static getDocumentBasedFallback(width, height) {
        // Determinar tipo de documento por proporciones
        const aspectRatio = width / height;
        
        console.log(`📐 Proporción del documento: ${aspectRatio.toFixed(2)}`);
        
        if (aspectRatio > 1.3) {
            // Documento horizontal (contratos, facturas)
            console.log('📄 Documento horizontal detectado - colocando en esquina inferior derecha');
            return { 
                x: width * 0.75 - 45, 
                y: height * 0.85 - 18 
            };
        } else if (aspectRatio < 0.8) {
            // Documento vertical estrecho (recibos, tickets)
            console.log('📄 Documento vertical estrecho detectado - colocando en esquina inferior izquierda');
            return { 
                x: width * 0.15, 
                y: height * 0.85 - 18 
            };
        } else {
            // Documento estándar (cartas, informes)
            console.log('📄 Documento estándar detectado - colocando en esquina inferior derecha');
            return { 
                x: width * 0.7 - 45, 
                y: height * 0.88 - 18 
            };
        }
    }

    // ===========================================
    // NUEVO ALGORITMO: Escaneo completo del documento
    // ===========================================
    static async scanDocumentForSignatureAreas(ctx, width, height) {
        try {
            console.log(`📐 Tamaño del documento: ${width}x${height}`);
            
            // Definir zonas estratégicas donde suelen estar las firmas
            const signatureZones = [
                // ZONA INFERIOR DERECHA (70% de documentos)
                { 
                    name: 'bottom_right',
                    x: width * 0.7, 
                    y: height * 0.85, 
                    width: width * 0.25,
                    height: 80,
                    priority: 1
                },
                // ZONA INFERIOR IZQUIERDA (20% de documentos)
                { 
                    name: 'bottom_left',
                    x: width * 0.1, 
                    y: height * 0.85, 
                    width: width * 0.25,
                    height: 80,
                    priority: 2
                },
                // ZONA DERECHA MEDIA (formularios verticales)
                { 
                    name: 'right_middle',
                    x: width * 0.7, 
                    y: height * 0.5, 
                    width: width * 0.25,
                    height: 80,
                    priority: 3
                },
                // ZONA IZQUIERDA MEDIA (documentos legales)
                { 
                    name: 'left_middle',
                    x: width * 0.1, 
                    y: height * 0.5, 
                    width: width * 0.25,
                    height: 80,
                    priority: 4
                },
                // ZONA CENTRO INFERIOR (10% de documentos)
                { 
                    name: 'center_bottom',
                    x: width * 0.4, 
                    y: height * 0.85, 
                    width: width * 0.2,
                    height: 80,
                    priority: 5
                }
            ];
            
            // Analizar cada zona por prioridad
            signatureZones.sort((a, b) => a.priority - b.priority);
            
            for (const zone of signatureZones) {
                console.log(`🔍 Analizando zona: ${zone.name} (${zone.x}, ${zone.y})`);
                
                // Verificar si la zona está vacía
                const isEmpty = this.isZoneEmpty(ctx, zone.x, zone.y, zone.width, zone.height);
                
                if (isEmpty) {
                    console.log(`✅ Zona ${zone.name} está vacía y disponible`);
                    
                    // Verificar si hay elementos alrededor que indiquen un campo de firma
                    const hasSignatureIndicators = this.checkForSignatureIndicators(ctx, zone);
                    
                    if (hasSignatureIndicators.found) {
                        console.log(`🎯 INDICADORES DE FIRMA ENCONTRADOS en ${zone.name}`);
                        return {
                            found: true,
                            x: hasSignatureIndicators.x,
                            y: hasSignatureIndicators.y,
                            type: `${zone.name}_with_indicators`
                        };
                    }
                    
                    // Si no hay indicadores pero la zona está vacía, usarla
                    return {
                        found: true,
                        x: zone.x + 10,
                        y: zone.y + 10,
                        type: zone.name
                    };
                }
            }
            
            // Si ninguna zona está vacía, buscar líneas o patrones específicos
            return this.findSignaturePatterns(ctx, width, height);
            
        } catch (error) {
            console.error('Error en scanDocumentForSignatureAreas:', error);
            return { found: false };
        }
    }

    // ===========================================
    // NUEVO: Verificar si una zona está vacía
    // ===========================================
    static isZoneEmpty(ctx, x, y, width, height) {
        try {
            // Ajustar coordenadas para no salirse del canvas
            const safeX = Math.max(0, x);
            const safeY = Math.max(0, y);
            const safeWidth = Math.min(width, ctx.canvas.width - safeX);
            const safeHeight = Math.min(height, ctx.canvas.height - safeY);
            
            if (safeWidth <= 0 || safeHeight <= 0) {
                return false;
            }
            
            // Obtener datos de píxeles de la zona
            const imageData = ctx.getImageData(safeX, safeY, safeWidth, safeHeight);
            const data = imageData.data;
            
            let darkPixelCount = 0;
            let totalPixels = 0;
            
            // Analizar cada píxel (muestreo cada 2 píxeles para velocidad)
            for (let i = 0; i < data.length; i += 8) { // 4 componentes por píxel * 2
                const r = data[i];
                const g = data[i + 1];
                const b = data[i + 2];
                
                // Calcular luminosidad
                const brightness = (r * 299 + g * 587 + b * 114) / 1000;
                
                // Considerar píxel oscuro si brillo < 180
                if (brightness < 180) {
                    darkPixelCount++;
                }
                
                totalPixels++;
            }
            
            // Calcular porcentaje de píxeles oscuros
            const darkPixelPercentage = (darkPixelCount / totalPixels) * 100;
            
            // Si menos del 15% de los píxeles son oscuros, considerar la zona vacía
            return darkPixelPercentage < 15;
            
        } catch (error) {
            console.error('Error en isZoneEmpty:', error);
            return false;
        }
    }

    // ===========================================
    // NUEVO: Buscar indicadores de firma alrededor de una zona
    // ===========================================
    static checkForSignatureIndicators(ctx, zone) {
        try {
            // Expandir área de búsqueda alrededor de la zona
            const searchArea = {
                x: Math.max(0, zone.x - 50),
                y: Math.max(0, zone.y - 30),
                width: zone.width + 100,
                height: zone.height + 60
            };
            
            // Patrones que indican campos de firma (líneas, texto, etc.)
            const indicators = [];
            
            // 1. Buscar líneas horizontales cerca
            for (let y = searchArea.y; y < searchArea.y + searchArea.height; y += 2) {
                let lineLength = 0;
                
                for (let x = searchArea.x; x < searchArea.x + searchArea.width; x++) {
                    if (x >= ctx.canvas.width || y >= ctx.canvas.height) continue;
                    
                    const pixel = ctx.getImageData(x, y, 1, 1).data;
                    const brightness = (pixel[0] * 299 + pixel[1] * 587 + pixel[2] * 114) / 1000;
                    
                    if (brightness < 100) { // Línea oscura
                        lineLength++;
                    }
                }
                
                // Si encontramos una línea de longitud significativa
                if (lineLength > 80 && lineLength < 250) {
                    indicators.push({
                        type: 'horizontal_line',
                        y: y,
                        length: lineLength
                    });
                }
            }
            
            // 2. Buscar texto alrededor (áreas con muchos píxeles oscuros)
            const textAreas = this.findTextAreas(ctx, searchArea);
            indicators.push(...textAreas);
            
            // Si encontramos indicadores, calcular mejor posición
            if (indicators.length > 0) {
                // Ordenar indicadores por proximidad a la zona
                indicators.sort((a, b) => {
                    const distA = Math.abs(a.y - zone.y);
                    const distB = Math.abs(b.y - zone.y);
                    return distA - distB;
                });
                
                const bestIndicator = indicators[0];
                
                // Posicionar la firma justo encima de la línea o cerca del texto
                if (bestIndicator.type === 'horizontal_line') {
                    return {
                        found: true,
                        x: zone.x + 10,
                        y: Math.max(0, bestIndicator.y - 70), // 70px encima de la línea
                        indicators: indicators.length
                    };
                } else {
                    return {
                        found: true,
                        x: zone.x + 10,
                        y: zone.y + 10,
                        indicators: indicators.length
                    };
                }
            }
            
        } catch (error) {
            console.error('Error en checkForSignatureIndicators:', error);
        }
        
        return { found: false };
    }

    // ===========================================
    // NUEVO: Encontrar áreas de texto
    // ===========================================
    static findTextAreas(ctx, area) {
        const textAreas = [];
        
        try {
            // Dividir el área en celdas
            const cellSize = 30;
            const cols = Math.ceil(area.width / cellSize);
            const rows = Math.ceil(area.height / cellSize);
            
            for (let row = 0; row < rows; row++) {
                for (let col = 0; col < cols; col++) {
                    const cellX = area.x + (col * cellSize);
                    const cellY = area.y + (row * cellSize);
                    
                    // Verificar si la celda tiene texto
                    if (this.cellHasText(ctx, cellX, cellY, cellSize, cellSize)) {
                        textAreas.push({
                            type: 'text_area',
                            x: cellX,
                            y: cellY,
                            width: cellSize,
                            height: cellSize
                        });
                    }
                }
            }
        } catch (error) {
            console.error('Error en findTextAreas:', error);
        }
        
        return textAreas;
    }

    // ===========================================
    // NUEVO: Verificar si celda tiene texto
    // ===========================================
    static cellHasText(ctx, x, y, width, height) {
        try {
            let darkPixels = 0;
            let totalPixels = 0;
            
            // Muestrear píxeles en la celda
            for (let py = y; py < y + height && py < ctx.canvas.height; py += 3) {
                for (let px = x; px < x + width && px < ctx.canvas.width; px += 3) {
                    const pixel = ctx.getImageData(px, py, 1, 1).data;
                    const brightness = (pixel[0] * 299 + pixel[1] * 587 + pixel[2] * 114) / 1000;
                    
                    if (brightness < 150) {
                        darkPixels++;
                    }
                    totalPixels++;
                }
            }
            
            // Si más del 20% de los píxeles son oscuros, probablemente es texto
            return totalPixels > 5 && (darkPixels / totalPixels) > 0.2;
            
        } catch (error) {
            return false;
        }
    }

    // ===========================================
    // NUEVO: Buscar líneas horizontales (método mejorado)
    // ===========================================
    static findHorizontalLines(ctx, width, height) {
        try {
            console.log('🔍 Buscando líneas horizontales para firma...');
            
            // Concentrar búsqueda en la parte inferior del documento
            const searchArea = {
                x: width * 0.1,
                y: height * 0.7,
                width: width * 0.8,
                height: height * 0.25
            };
            
            const lines = [];
            
            // Escanear línea por línea
            for (let y = searchArea.y; y < searchArea.y + searchArea.height; y += 2) {
                let lineLength = 0;
                let lineStart = 0;
                let maxLineLength = 0;
                let maxLineStart = 0;
                
                for (let x = searchArea.x; x < searchArea.x + searchArea.width; x++) {
                    const pixel = ctx.getImageData(x, y, 1, 1).data;
                    const brightness = (pixel[0] * 299 + pixel[1] * 587 + pixel[2] * 114) / 1000;
                    
                    if (brightness < 100) { // Línea oscura
                        if (lineLength === 0) {
                            lineStart = x;
                        }
                        lineLength++;
                    } else {
                        if (lineLength > maxLineLength) {
                            maxLineLength = lineLength;
                            maxLineStart = lineStart;
                        }
                        lineLength = 0;
                    }
                }
                
                // Verificar línea al final
                if (lineLength > maxLineLength) {
                    maxLineLength = lineLength;
                    maxLineStart = lineStart;
                }
                
                // Línea de firma típica: 80-250 píxeles de largo
                if (maxLineLength >= 80 && maxLineLength <= 250) {
                    lines.push({
                        x: maxLineStart,
                        y: y,
                        length: maxLineLength
                    });
                }
            }
            
            // Ordenar líneas por posición Y (de arriba a abajo)
            lines.sort((a, b) => a.y - b.y);
            
            // Tomar la primera línea encontrada
            if (lines.length > 0) {
                const bestLine = lines[0];
                
                // Buscar espacio encima de la línea para la firma
                const spaceAbove = this.findSpaceAboveLine(ctx, bestLine.x, bestLine.y, bestLine.length, 70);
                
                if (spaceAbove.found) {
                    return {
                        found: true,
                        x: spaceAbove.x,
                        y: spaceAbove.y,
                        lineCount: lines.length
                    };
                }
            }
            
        } catch (error) {
            console.error('Error en findHorizontalLines:', error);
        }
        
        return { found: false };
    }

    // ===========================================
    // NUEVO: Buscar espacio encima de una línea
    // ===========================================
    static findSpaceAboveLine(ctx, lineX, lineY, lineLength, spaceHeight) {
        try {
            const spaceWidth = lineLength;
            const startX = lineX;
            const startY = Math.max(0, lineY - spaceHeight);
            
            // Verificar si el área está vacía
            if (this.isAreaEmptyForSignature(ctx, startX, startY, spaceWidth, spaceHeight)) {
                return {
                    found: true,
                    x: startX + (spaceWidth / 2) - 75, // Centrar la firma
                    y: startY + 10
                };
            }
        } catch (error) {
            console.error('Error en findSpaceAboveLine:', error);
        }
        
        return { found: false };
    }

    // ===========================================
    // NUEVO: Verificar si área está vacía (para firma)
    // ===========================================
    static isAreaEmptyForSignature(ctx, x, y, width, height) {
        try {
            if (x < 0 || y < 0 || x + width > ctx.canvas.width || y + height > ctx.canvas.height) {
                return false;
            }
            
            let darkPixels = 0;
            let totalPixels = 0;
            
            // Muestrear el área
            for (let sy = y; sy < y + height; sy += 4) {
                for (let sx = x; sx < x + width; sx += 4) {
                    const pixel = ctx.getImageData(sx, sy, 1, 1).data;
                    const brightness = (pixel[0] * 299 + pixel[1] * 587 + pixel[2] * 114) / 1000;
                    
                    if (brightness < 180) {
                        darkPixels++;
                    }
                    totalPixels++;
                }
            }
            
            // Si menos del 8% de píxeles son oscuros, está suficientemente vacío
            return totalPixels > 10 && (darkPixels / totalPixels) < 0.08;
            
        } catch (error) {
            console.error('Error en isAreaEmptyForSignature:', error);
            return false;
        }
    }

    // ===========================================
    // NUEVO: Buscar campos vacíos de firma
    // ===========================================
    static findEmptySignatureFields(ctx, width, height) {
        try {
            console.log('🔍 Buscando campos vacíos específicos para firma...');
            
            // Posiciones comunes para campos de firma en documentos colombianos
            const commonFields = [
                // Para documentos CC 30665 y similares
                { x: width * 0.65, y: height * 0.83, w: 180, h: 60, name: 'firma_recibe' },
                { x: width * 0.15, y: height * 0.83, w: 180, h: 60, name: 'firma_entrega' },
                // Para documentos legales
                { x: width * 0.7, y: height * 0.4, w: 180, h: 60, name: 'firma_derecha' },
                { x: width * 0.1, y: height * 0.4, w: 180, h: 60, name: 'firma_izquierda' },
                // Para contratos
                { x: width * 0.4, y: height * 0.9, w: 180, h: 60, name: 'firma_centro' }
            ];
            
            // Verificar cada campo común
            for (const field of commonFields) {
                if (this.isAreaEmptyForSignature(ctx, field.x, field.y, field.w, field.h)) {
                    console.log(`✅ Campo vacío encontrado: ${field.name}`);
                    return {
                        found: true,
                        x: field.x + 10,
                        y: field.y + 10,
                        fieldName: field.name
                    };
                }
            }
            
        } catch (error) {
            console.error('Error en findEmptySignatureFields:', error);
        }
        
        return { found: false };
    }

    // ===========================================
    // NUEVO: Analizar zonas del documento
    // ===========================================
    static analyzeDocumentZones(ctx, width, height) {
        try {
            console.log('📊 Analizando zonas del documento...');
            
            // Dividir el documento en zonas
            const zones = [
                { name: 'bottom_right_quarter', x: width * 0.75, y: height * 0.75, w: width * 0.25, h: height * 0.25 },
                { name: 'bottom_left_quarter', x: 0, y: height * 0.75, w: width * 0.25, h: height * 0.25 },
                { name: 'right_side', x: width * 0.7, y: height * 0.3, w: width * 0.3, h: height * 0.4 },
                { name: 'left_side', x: 0, y: height * 0.3, w: width * 0.3, h: height * 0.4 }
            ];
            
            let bestZone = null;
            let bestScore = 0;
            
            // Analizar cada zona
            for (const zone of zones) {
                const score = this.evaluateZoneForSignature(ctx, zone);
                
                if (score > bestScore) {
                    bestScore = score;
                    bestZone = zone;
                }
            }
            
            // Si encontramos una zona buena
            if (bestZone && bestScore > 0.5) {
                console.log(`✅ Mejor zona: ${bestZone.name} (score: ${bestScore})`);
                
                // Encontrar posición óptima dentro de la zona
                const position = this.findBestPositionInZone(ctx, bestZone);
                
                if (position.found) {
                    return {
                        found: true,
                        x: position.x,
                        y: position.y,
                        zone: bestZone.name,
                        score: bestScore
                    };
                }
            }
            
        } catch (error) {
            console.error('Error en analyzeDocumentZones:', error);
        }
        
        return { found: false };
    }

    // ===========================================
    // NUEVO: Evaluar zona para firma
    // ===========================================
    static evaluateZoneForSignature(ctx, zone) {
        try {
            let score = 0;
            
            // 1. Verificar si la zona está vacía (puntos altos)
            if (this.isZoneEmpty(ctx, zone.x, zone.y, zone.w, zone.h)) {
                score += 0.7;
            }
            
            // 2. Verificar si hay líneas cerca (puntos altos)
            const hasLinesNearby = this.checkForLinesNearZone(ctx, zone);
            if (hasLinesNearby) {
                score += 0.3;
            }
            
            // 3. Penalizar zonas demasiado cerca de bordes
            const borderDistance = Math.min(zone.x, zone.y, ctx.canvas.width - (zone.x + zone.w), ctx.canvas.height - (zone.y + zone.h));
            if (borderDistance < 20) {
                score -= 0.2;
            }
            
            return Math.max(0, Math.min(1, score));
            
        } catch (error) {
            console.error('Error en evaluateZoneForSignature:', error);
            return 0;
        }
    }

    // ===========================================
    // NUEVO: Encontrar mejor posición dentro de una zona
    // ===========================================
    static findBestPositionInZone(ctx, zone) {
        try {
            // Intentar posiciones dentro de la zona
            const positions = [
                { x: zone.x + 20, y: zone.y + 20 },
                { x: zone.x + zone.w - 200, y: zone.y + 20 },
                { x: zone.x + zone.w / 2 - 75, y: zone.y + zone.h / 2 - 30 }
            ];
            
            for (const pos of positions) {
                // Verificar si hay espacio para una firma (90x36)
                if (this.isAreaEmptyForSignature(ctx, pos.x, pos.y, 90, 36)) {
                    return {
                        found: true,
                        x: pos.x,
                        y: pos.y
                    };
                }
            }
            
        } catch (error) {
            console.error('Error en findBestPositionInZone:', error);
        }
        
        return { found: false };
    }

    // ===========================================
    // NUEVO: Obtener posición inteligente basada en tipo de documento
    // ===========================================
    static getSmartPositionBasedOnDocumentType(width, height) {
        // Determinar tipo de documento por proporciones
        const aspectRatio = width / height;
        
        console.log(`📐 Proporción del documento: ${aspectRatio.toFixed(2)}`);
        
        if (aspectRatio > 1.5) {
            // Documento horizontal (landscape) - común en contratos
            console.log('📄 Documento horizontal detectado');
            return { 
                x: width * 0.75 - 100, 
                y: height * 0.85 - 30 
            };
        } else if (aspectRatio < 0.8) {
            // Documento vertical muy estrecho - común en recibos
            console.log('📄 Documento vertical estrecho detectado');
            return { 
                x: width * 0.15, 
                y: height * 0.85 - 30 
            };
        } else if (aspectRatio < 1.2) {
            // Documento casi cuadrado - común en formularios
            console.log('📄 Documento cuadrado detectado');
            return { 
                x: width * 0.7 - 100, 
                y: height * 0.8 - 30 
            };
        } else {
            // Documento vertical estándar - común en cartas
            console.log('📄 Documento vertical estándar detectado');
            return { 
                x: width * 0.65 - 100, 
                y: height * 0.88 - 30 
            };
        }
    }

    // ===========================================
    // NUEVO: Buscar patrones de firma específicos
    // ===========================================
    static findSignaturePatterns(ctx, width, height) {
        try {
            console.log('🎯 Buscando patrones específicos de firma...');
            
            // Patrones comunes en documentos colombianos
            const patterns = [
                // Patrón: Línea con texto "Firma:" arriba
                { name: 'firma_con_texto', searchArea: { x: width * 0.1, y: height * 0.7, w: width * 0.8, h: height * 0.25 } },
                // Patrón: Espacio rectangular delimitado
                { name: 'espacio_delimitado', searchArea: { x: width * 0.6, y: height * 0.8, w: width * 0.35, h: 70 } },
                // Patrón: Múltiples líneas paralelas (para varias firmas)
                { name: 'lineas_paralelas', searchArea: { x: width * 0.1, y: height * 0.8, w: width * 0.8, h: 100 } }
            ];
            
            for (const pattern of patterns) {
                const found = this.detectPattern(ctx, pattern);
                if (found.found) {
                    console.log(`✅ Patrón encontrado: ${pattern.name}`);
                    return found;
                }
            }
            
        } catch (error) {
            console.error('Error en findSignaturePatterns:', error);
        }
        
        return { found: false };
    }

    // ===========================================
    // NUEVO: Detectar patrón específico
    // ===========================================
    static detectPattern(ctx, pattern) {
        // Implementación básica - puedes expandir esto
        return { found: false };
    }

    // ===========================================
    // NUEVO: Verificar si hay líneas cerca de una zona
    // ===========================================
    static checkForLinesNearZone(ctx, zone) {
        try {
            // Expandir zona para buscar líneas
            const expandedZone = {
                x: Math.max(0, zone.x - 30),
                y: Math.max(0, zone.y - 30),
                w: zone.w + 60,
                h: zone.h + 60
            };
            
            // Buscar líneas horizontales en la zona expandida
            for (let y = expandedZone.y; y < expandedZone.y + expandedZone.h; y += 5) {
                let lineLength = 0;
                
                for (let x = expandedZone.x; x < expandedZone.x + expandedZone.w; x++) {
                    const pixel = ctx.getImageData(x, y, 1, 1).data;
                    const brightness = (pixel[0] * 299 + pixel[1] * 587 + pixel[2] * 114) / 1000;
                    
                    if (brightness < 100) {
                        lineLength++;
                    }
                }
                
                if (lineLength > 50) {
                    return true;
                }
            }
            
        } catch (error) {
            console.error('Error en checkForLinesNearZone:', error);
        }
        
        return false;
    }

    // ===========================================
    // NUEVA FUNCIÓN: Buscar espacio en esquina inferior derecha
    // ===========================================
    static findBottomRightSpace(ctx, width, height) {
        try {
            // Área en la esquina inferior derecha (último 20% de ancho, último 15% de alto)
            const searchArea = {
                x: width * 0.8,
                y: height * 0.85,
                width: width * 0.2,
                height: height * 0.15
            };
            
            // Buscar espacio para firma de 90x36
            const spaceNeeded = { width: 90, height: 36 };
            
            for (let y = searchArea.y; y < searchArea.y + searchArea.height - spaceNeeded.height; y += 10) {
                for (let x = searchArea.x; x < searchArea.x + searchArea.width - spaceNeeded.width; x += 10) {
                    const isEmpty = this.isAreaEmpty(ctx, x, y, spaceNeeded.width, spaceNeeded.height);
                    if (isEmpty) {
                        return {
                            found: true,
                            x: x + 5,
                            y: y + 5
                        };
                    }
                }
            }
            
        } catch (error) {
            console.error('Error en findBottomRightSpace:', error);
        }
        
        return { found: false, x: 0, y: 0 };
    }

    // ===========================================
    // NUEVA FUNCIÓN: Buscar espacio en esquina inferior izquierda
    // ===========================================
    static findBottomLeftSpace(ctx, width, height) {
        try {
            // Área en la esquina inferior izquierda (primer 20% de ancho, último 15% de alto)
            const searchArea = {
                x: width * 0.05,
                y: height * 0.85,
                width: width * 0.25,
                height: height * 0.15
            };
            
            // Buscar espacio para firma de 90x36
            const spaceNeeded = { width: 90, height: 36 };
            
            for (let y = searchArea.y; y < searchArea.y + searchArea.height - spaceNeeded.height; y += 10) {
                for (let x = searchArea.x; x < searchArea.x + searchArea.width - spaceNeeded.width; x += 10) {
                    const isEmpty = this.isAreaEmpty(ctx, x, y, spaceNeeded.width, spaceNeeded.height);
                    if (isEmpty) {
                        return {
                            found: true,
                            x: x + 5,
                            y: y + 5
                        };
                    }
                }
            }
            
        } catch (error) {
            console.error('Error en findBottomLeftSpace:', error);
        }
        
        return { found: false, x: 0, y: 0 };
    }

    // ===========================================
    // FUNCIÓN: Buscar campos por palabras clave (OCR mejorado)
    // ===========================================
    static async findFieldByKeywords(ctx, width, height, keywords) {
        try {
            // Escanear en la parte inferior del documento (último 40%)
            const scanArea = {
                x: 0,
                y: height * 0.6,
                width: width,
                height: height * 0.4
            };
            
            // Dividir en celdas para escanear
            const gridSize = 15;
            const cellWidth = Math.floor(scanArea.width / gridSize);
            const cellHeight = Math.floor(scanArea.height / gridSize);
            
            for (let gy = 0; gy < gridSize; gy++) {
                for (let gx = 0; gx < gridSize; gx++) {
                    const cellX = scanArea.x + (gx * cellWidth);
                    const cellY = scanArea.y + (gy * cellHeight);
                    
                    // Verificar si esta celda tiene texto (píxeles oscuros)
                    if (this.hasTextInCell(ctx, cellX, cellY, cellWidth, cellHeight)) {
                        // Verificar si el patrón coincide con keywords
                        const matchesKeyword = await this.checkForKeywordsInCell(ctx, cellX, cellY, cellWidth, cellHeight, keywords);
                        
                        if (matchesKeyword) {
                            return {
                                found: true,
                                x: cellX,
                                y: cellY,
                                width: cellWidth,
                                height: cellHeight,
                                keyword: keywords[0]
                            };
                        }
                    }
                }
            }
            
        } catch (error) {
            console.error('Error en findFieldByKeywords:', error);
        }
        
        return { found: false, x: 0, y: 0 };
    }

    // ===========================================
    // FUNCIÓN: Verificar si celda tiene texto
    // ===========================================
    static hasTextInCell(ctx, x, y, width, height) {
        try {
            let darkPixels = 0;
            let totalPixels = 0;
            
            // Escanear una muestra de píxeles en la celda
            for (let sy = y; sy < y + height && sy < ctx.canvas.height; sy += 2) { // Más denso
                for (let sx = x; sx < x + width && sx < ctx.canvas.width; sx += 2) {
                    const pixel = ctx.getImageData(sx, sy, 1, 1).data;
                    // Calcular luminosidad
                    const brightness = (pixel[0] * 0.299 + pixel[1] * 0.587 + pixel[2] * 0.114);
                    
                    if (brightness < 120) { // Píxel oscuro (probablemente texto)
                        darkPixels++;
                    }
                    totalPixels++;
                }
            }
            
            // Si más del 15% de los píxeles son oscuros, probablemente es texto
            return totalPixels > 0 && (darkPixels / totalPixels) > 0.15;
            
        } catch (error) {
            return false;
        }
    }

    // ===========================================
    // FUNCIÓN: Buscar espacio vacío cerca de un campo
    // ===========================================
    static findEmptySpaceNearField(ctx, field, width, height) {
        try {
            // Prioridad 1: Buscar a la derecha del campo (común en formularios)
            const rightArea = {
                x: field.x + field.width + 5,
                y: field.y,
                width: 200,
                height: field.height
            };
            
            if (rightArea.x + rightArea.width < width && 
                this.isAreaEmpty(ctx, rightArea.x, rightArea.y, rightArea.width, rightArea.height)) {
                return {
                    found: true,
                    x: rightArea.x + 5,
                    y: rightArea.y + 5
                };
            }
            
            // Prioridad 2: Buscar debajo del campo
            const belowArea = {
                x: field.x,
                y: field.y + field.height + 5,
                width: field.width,
                height: 80
            };
            
            if (belowArea.y + belowArea.height < height && 
                this.isAreaEmpty(ctx, belowArea.x, belowArea.y, belowArea.width, belowArea.height)) {
                return {
                    found: true,
                    x: belowArea.x + 5,
                    y: belowArea.y + 5
                };
            }
            
            // Prioridad 3: Buscar en diagonal inferior derecha
            const diagonalArea = {
                x: field.x + field.width / 2,
                y: field.y + field.height + 5,
                width: 150,
                height: 60
            };
            
            if (diagonalArea.x + diagonalArea.width < width && 
                diagonalArea.y + diagonalArea.height < height &&
                this.isAreaEmpty(ctx, diagonalArea.x, diagonalArea.y, diagonalArea.width, diagonalArea.height)) {
                return {
                    found: true,
                    x: diagonalArea.x + 5,
                    y: diagonalArea.y + 5
                };
            }
            
            // Prioridad 4: Buscar en la esquina inferior derecha del documento
            const bottomRight = {
                x: width - 250,
                y: height - 100,
                width: 200,
                height: 80
            };
            
            if (this.isAreaEmpty(ctx, bottomRight.x, bottomRight.y, bottomRight.width, bottomRight.height)) {
                return {
                    found: true,
                    x: bottomRight.x + 10,
                    y: bottomRight.y + 10
                };
            }
            
        } catch (error) {
            console.error('Error en findEmptySpaceNearField:', error);
        }
        
        return { found: false, x: 0, y: 0 };
    }

    // ===========================================
    // FUNCIÓN: Buscar líneas de firma en tablas
    // ===========================================
    static findSignatureLinesInTable(ctx, width, height) {
        try {
            // Buscar en la parte inferior (donde suelen estar las firmas)
            const bottomArea = {
                x: 0,
                y: height * 0.7,
                width: width,
                height: height * 0.3
            };
            
            // Buscar líneas horizontales paralelas (típicas en tablas de firmas)
            const lines = [];
            
            for (let y = bottomArea.y; y < bottomArea.y + bottomArea.height; y += 2) {
                let lineLength = 0;
                let lineStartX = 0;
                
                for (let x = bottomArea.x; x < bottomArea.x + bottomArea.width; x++) {
                    const pixel = ctx.getImageData(x, y, 1, 1).data;
                    const brightness = (pixel[0] + pixel[1] + pixel[2]) / 3;
                    
                    if (brightness < 100) { // Línea oscura
                        if (lineLength === 0) {
                            lineStartX = x;
                        }
                        lineLength++;
                    } else {
                        if (lineLength > 80 && lineLength < 300) { // Línea de tamaño apropiado
                            lines.push({
                                x: lineStartX,
                                y: y,
                                length: lineLength
                            });
                        }
                        lineLength = 0;
                    }
                }
            }
            
            // Agrupar líneas por posición Y similar
            if (lines.length >= 2) {
                lines.sort((a, b) => a.y - b.y);
                
                // Buscar espacio encima de la primera línea
                const firstLine = lines[0];
                const spaceAbove = this.checkSpaceAboveLine(ctx, firstLine.x, firstLine.y, firstLine.length, 60);
                
                if (spaceAbove.found) {
                    return {
                        found: true,
                        x: spaceAbove.x,
                        y: spaceAbove.y,
                        lineCount: lines.length
                    };
                }
            }
            
        } catch (error) {
            console.error('Error en findSignatureLinesInTable:', error);
        }
        
        return { found: false, x: 0, y: 0 };
    }

    // ===========================================
    // FUNCIÓN: Buscar áreas rectangulares vacías
    // ===========================================
    static findEmptyRectangularAreas(ctx, width, height) {
        try {
            // Posiciones comunes para campos de firma en formularios
            const commonPositions = [
                { x: width * 0.6, y: height * 0.85, width: 180, height: 60 }, // Esquina inferior derecha
                { x: width * 0.1, y: height * 0.85, width: 180, height: 60 }, // Esquina inferior izquierda
                { x: width * 0.35, y: height * 0.85, width: 180, height: 60 }, // Centro inferior
                { x: width * 0.7, y: height * 0.4, width: 180, height: 60 },  // Lado derecho medio
                { x: width * 0.1, y: height * 0.4, width: 180, height: 60 }   // Lado izquierdo medio
            ];
            
            for (const pos of commonPositions) {
                if (this.isAreaEmpty(ctx, pos.x, pos.y, pos.width, pos.height)) {
                    return {
                        found: true,
                        x: pos.x + 10,
                        y: pos.y + 10
                    };
                }
            }
            
        } catch (error) {
            console.error('Error en findEmptyRectangularAreas:', error);
        }
        
        return { found: false, x: 0, y: 0 };
    }

    // ===========================================
    // FUNCIÓN: Verificar si área está vacía
    // ===========================================
    static isAreaEmpty(ctx, x, y, width, height) {
        try {
            if (x < 0 || y < 0 || x + width > ctx.canvas.width || y + height > ctx.canvas.height) {
                return false;
            }
            
            let darkPixels = 0;
            let totalPixels = 0;
            const sampleStep = 3;
            
            for (let sy = y; sy < y + height; sy += sampleStep) {
                for (let sx = x; sx < x + width; sx += sampleStep) {
                    const pixel = ctx.getImageData(sx, sy, 1, 1).data;
                    // Calcular luminosidad con pesos correctos
                    const brightness = (pixel[0] * 0.299 + pixel[1] * 0.587 + pixel[2] * 0.114);
                    
                    if (brightness < 180) { // Píxel oscuro
                        darkPixels++;
                    }
                    totalPixels++;
                }
            }
            
            return totalPixels > 15 && (darkPixels / totalPixels) < 0.05; // Menos del 5% de píxeles oscuros
            
        } catch (error) {
            console.error('Error en isAreaEmpty:', error);
            return false;
        }
    }

    // ===========================================
    // FUNCIÓN: Posición inteligente por defecto
    // ===========================================
    static getSmartDefaultPosition(width, height) {
        // Basado en documentos comunes
        const aspectRatio = width / height;
        
        if (aspectRatio > 1.5) {
            // Documento horizontal - firma en esquina inferior derecha
            return { x: width * 0.7 - 90, y: height * 0.85 - 30 };
        } else if (aspectRatio < 0.8) {
            // Documento vertical - firma en esquina inferior izquierda
            return { x: width * 0.1, y: height * 0.85 - 30 };
        } else {
            // Documento cuadrado - centro inferior
            return { x: width * 0.5 - 90, y: height * 0.85 - 30 };
        }
    }

    // ===========================================
    // FUNCIÓN MEJORADA: Buscar patrones específicos
    // ===========================================
    static findSpecificSignaturePattern(ctx, width, height) {
        try {
            // Buscar en la parte inferior del documento (último 20%)
            const bottomArea = {
                x: 0,
                y: height * 0.8,
                width: width,
                height: height * 0.2
            };
            
            // Buscar múltiples firmas alineadas (como en CC 30665)
            const alignedSignatures = this.findAlignedSignatureFields(ctx, bottomArea);
            if (alignedSignatures.found) {
                return {
                    found: true,
                    type: 'aligned_signatures',
                    x: alignedSignatures.x,
                    y: alignedSignatures.y
                };
            }
            
            // Buscar campos con "Firma:" o similar
            const signatureText = this.findSignatureTextFields(ctx, bottomArea);
            if (signatureText.found) {
                return {
                    found: true,
                    type: 'signature_text',
                    x: signatureText.x,
                    y: signatureText.y
                };
            }
            
            // Buscar espacios con líneas y cajas
            const boxedArea = this.findBoxedSignatureArea(ctx, bottomArea);
            if (boxedArea.found) {
                return {
                    found: true,
                    type: 'boxed_area',
                    x: boxedArea.x,
                    y: boxedArea.y
                };
            }
            
        } catch (error) {
            console.error('Error en findSpecificSignaturePattern:', error);
        }
        
        return { found: false, x: 0, y: 0 };
    }

    // ===========================================
    // FUNCIÓN: Buscar múltiples firmas alineadas
    // ===========================================
    static findAlignedSignatureFields(ctx, area) {
        try {
            // Buscar líneas horizontales alineadas
            const lines = [];
            const scanStep = 3;
            
            for (let y = area.y; y < area.y + area.height; y += scanStep) {
                let lineLength = 0;
                let lineStartX = 0;
                let maxLineLength = 0;
                let maxLineStartX = 0;
                
                for (let x = area.x; x < area.x + area.width; x++) {
                    const pixel = ctx.getImageData(x, y, 1, 1).data;
                    const brightness = (pixel[0] + pixel[1] + pixel[2]) / 3;
                    
                    if (brightness < 100) {
                        if (lineLength === 0) {
                            lineStartX = x;
                        }
                        lineLength++;
                    } else {
                        if (lineLength > maxLineLength) {
                            maxLineLength = lineLength;
                            maxLineStartX = lineStartX;
                        }
                        lineLength = 0;
                    }
                }
                
                // Verificar línea al final
                if (lineLength > maxLineLength) {
                    maxLineLength = lineLength;
                    maxLineStartX = lineStartX;
                }
                
                // Línea de firma típica: 100-200 píxeles
                if (maxLineLength >= 80 && maxLineLength <= 250) {
                    lines.push({
                        x: maxLineStartX,
                        y: y,
                        length: maxLineLength,
                        endX: maxLineStartX + maxLineLength
                    });
                }
            }
            
            // Buscar grupos de líneas alineadas
            if (lines.length >= 2) {
                // Agrupar líneas por posición Y similar
                const groupedLines = this.groupLinesByYPosition(lines, 20); // 20px de margen
                
                for (const group of groupedLines) {
                    if (group.length >= 2) {
                        // Ordenar por X (de izquierda a derecha)
                        group.sort((a, b) => a.x - b.x);
                        
                        // Tomar la primera línea del grupo
                        const firstLine = group[0];
                        
                        // Verificar espacio arriba de la línea
                        const spaceAbove = this.checkSpaceAboveLine(ctx, firstLine.x, firstLine.y, 180, 60);
                        if (spaceAbove.found) {
                            return {
                                found: true,
                                x: spaceAbove.x,
                                y: spaceAbove.y,
                                lineCount: group.length
                            };
                        }
                    }
                }
            }
            
        } catch (error) {
            console.error('Error en findAlignedSignatureFields:', error);
        }
        
        return { found: false, x: 0, y: 0 };
    }

    // ===========================================
    // FUNCIÓN: Agrupar líneas por posición Y
    // ===========================================
    static groupLinesByYPosition(lines, margin) {
        const groups = [];
        const usedLines = new Set();
        
        for (let i = 0; i < lines.length; i++) {
            if (usedLines.has(i)) continue;
            
            const group = [lines[i]];
            usedLines.add(i);
            
            for (let j = i + 1; j < lines.length; j++) {
                if (usedLines.has(j)) continue;
                
                // Si las líneas están aproximadamente en la misma Y
                if (Math.abs(lines[i].y - lines[j].y) <= margin) {
                    group.push(lines[j]);
                    usedLines.add(j);
                }
            }
            
            groups.push(group);
        }
        
        return groups;
    }

    // ===========================================
    // FUNCIÓN: Buscar campos de firma por texto
    // ===========================================
    static findSignatureFieldByText(ctx, width, height) {
        return this.findSignatureTextFields(ctx, { x: 0, y: height * 0.7, width: width, height: height * 0.3 });
    }

    // ===========================================
    // FUNCIÓN: Buscar campos de firma por texto (mejorada)
    // ===========================================
    static findSignatureTextFields(ctx, area) {
        try {
            // Palabras clave específicas para documentos colombianos
            const signatureKeywords = [
                'firma', 'firma:', 'firma :',
                'firmado', 'firmado:', 'firmado :',
                'nombre', 'nombre:', 'nombre :',
                'aprobado', 'aprobado:', 'aprobado :',
                'recibido', 'recibido:', 'recibido :',
                'elaborado', 'elaborado:', 'elaborado :',
                'revisado', 'revisado:', 'revisado :',
                'autorizado', 'autorizado:', 'autorizado :',
                'entrego', 'entrego:', 'entrego :',
                'recibió', 'recibió:', 'recibió :',
                'inspecciono', 'inspecciono:', 'inspecciono :',
                'aprobo', 'aprobo:', 'aprobo :'
            ];
            
            // Escanear el área en busca de regiones con texto
            const textRegions = this.scanForTextRegionsImproved(ctx, area);
            
            for (const region of textRegions) {
                // Verificar si hay espacio debajo (para firmar)
                const spaceBelow = this.findSpaceBelowText(ctx, region);
                
                if (spaceBelow.found) {
                    return {
                        found: true,
                        fieldType: 'text_with_space',
                        x: spaceBelow.x,
                        y: spaceBelow.y,
                        textRegion: region
                    };
                }
            }
            
        } catch (error) {
            console.error('Error en findSignatureTextFields:', error);
        }
        
        return { found: false, x: 0, y: 0 };
    }

    // ===========================================
    // FUNCIÓN: Escanear regiones de texto mejorado
    // ===========================================
    static scanForTextRegionsImproved(ctx, area) {
        const regions = [];
        const gridSize = 12;
        const cellWidth = Math.floor(area.width / gridSize);
        const cellHeight = Math.floor(area.height / gridSize);
        
        for (let gy = 0; gy < gridSize; gy++) {
            for (let gx = 0; gx < gridSize; gx++) {
                const cellX = area.x + (gx * cellWidth);
                const cellY = area.y + (gy * cellHeight);
                
                // Calcular densidad de píxeles oscuros
                let darkPixels = 0;
                let totalPixels = 0;
                
                for (let y = cellY; y < cellY + cellHeight; y += 3) {
                    for (let x = cellX; x < cellX + cellWidth; x += 3) {
                        try {
                            const pixel = ctx.getImageData(x, y, 1, 1).data;
                            const brightness = (pixel[0] + pixel[1] + pixel[2]) / 3;
                            
                            if (brightness < 150) {
                                darkPixels++;
                            }
                            totalPixels++;
                        } catch (e) {
                            // Ignorar errores
                        }
                    }
                }
                
                const density = totalPixels > 0 ? darkPixels / totalPixels : 0;
                
                if (density > 0.25) { // Región con texto significativo
                    regions.push({
                        x: cellX,
                        y: cellY,
                        width: cellWidth,
                        height: cellHeight,
                        density: density,
                        centerX: cellX + cellWidth / 2,
                        centerY: cellY + cellHeight / 2
                    });
                }
            }
        }
        
        return regions;
    }

    // ===========================================
    // FUNCIÓN: Buscar espacio debajo de texto
    // ===========================================
    static findSpaceBelowText(ctx, textRegion) {
        try {
            // Buscar línea horizontal debajo del texto
            const startY = textRegion.y + textRegion.height;
            const searchHeight = 40;
            
            for (let y = startY; y < startY + searchHeight; y += 2) {
                let lineLength = 0;
                let lineStartX = textRegion.x;
                
                for (let x = textRegion.x; x < textRegion.x + textRegion.width; x++) {
                    const pixel = ctx.getImageData(x, y, 1, 1).data;
                    const brightness = (pixel[0] + pixel[1] + pixel[2]) / 3;
                    
                    if (brightness < 120) {
                        if (lineLength === 0) {
                            lineStartX = x;
                        }
                        lineLength++;
                    } else {
                        if (lineLength > 50) { // Línea encontrada
                            // Buscar espacio para firma encima de la línea
                            const spaceAbove = this.checkSpaceAboveLine(ctx, lineStartX, y, lineLength, 50);
                            if (spaceAbove.found) {
                                return {
                                    found: true,
                                    x: spaceAbove.x,
                                    y: spaceAbove.y,
                                    lineY: y,
                                    lineLength: lineLength
                                };
                            }
                        }
                        lineLength = 0;
                    }
                }
                
                // Verificar línea al final
                if (lineLength > 50) {
                    const spaceAbove = this.checkSpaceAboveLine(ctx, lineStartX, y, lineLength, 50);
                    if (spaceAbove.found) {
                        return {
                            found: true,
                            x: spaceAbove.x,
                            y: spaceAbove.y,
                            lineY: y,
                            lineLength: lineLength
                        };
                    }
                }
            }
            
            // Si no hay línea, buscar espacio vacío debajo
            const spaceBelow = this.findEmptySpaceBelow(ctx, textRegion.x, startY, textRegion.width, 60);
            if (spaceBelow.found) {
                return {
                    found: true,
                    x: spaceBelow.x,
                    y: spaceBelow.y
                };
            }
            
        } catch (error) {
            console.error('Error en findSpaceBelowText:', error);
        }
        
        return { found: false, x: 0, y: 0 };
    }

    // ===========================================
    // FUNCIÓN: Buscar línea de firma con espacio
    // ===========================================
    static findSignatureLineWithSpace(ctx, width, height) {
        try {
            // Buscar en la parte inferior del documento
            const bottomArea = {
                x: 0,
                y: height * 0.7,
                width: width,
                height: height * 0.3
            };
            
            // Escanear para líneas horizontales
            for (let y = bottomArea.y; y < bottomArea.y + bottomArea.height; y += 3) {
                let lineLength = 0;
                let lineStartX = 0;
                let maxLineLength = 0;
                let maxLineStartX = 0;
                
                for (let x = bottomArea.x; x < bottomArea.x + bottomArea.width; x++) {
                    const pixel = ctx.getImageData(x, y, 1, 1).data;
                    const brightness = (pixel[0] + pixel[1] + pixel[2]) / 3;
                    
                    if (brightness < 100) {
                        if (lineLength === 0) {
                            lineStartX = x;
                        }
                        lineLength++;
                    } else {
                        if (lineLength > maxLineLength) {
                            maxLineLength = lineLength;
                            maxLineStartX = lineStartX;
                        }
                        lineLength = 0;
                    }
                }
                
                // Verificar línea al final
                if (lineLength > maxLineLength) {
                    maxLineLength = lineLength;
                    maxLineStartX = lineStartX;
                }
                
                // Línea de firma válida
                if (maxLineLength >= 80 && maxLineLength <= 300) {
                    // Verificar espacio encima de la línea
                    const spaceAbove = this.checkSpaceAboveLine(ctx, maxLineStartX, y, maxLineLength, 60);
                    if (spaceAbove.found) {
                        return {
                            found: true,
                            x: spaceAbove.x,
                            y: spaceAbove.y,
                            lineLength: maxLineLength,
                            lineY: y
                        };
                    }
                }
            }
            
        } catch (error) {
            console.error('Error en findSignatureLineWithSpace:', error);
        }
        
        return { found: false, x: 0, y: 0 };
    }

    // ===========================================
    // FUNCIÓN: Verificar espacio encima de línea
    // ===========================================
    static checkSpaceAboveLine(ctx, lineX, lineY, lineLength, checkHeight) {
        try {
            const spaceWidth = lineLength;
            const spaceHeight = checkHeight;
            const startX = lineX;
            const startY = Math.max(0, lineY - spaceHeight);
            
            // Verificar si el área está vacía
            let darkPixels = 0;
            let totalPixels = 0;
            
            for (let y = startY; y < lineY; y += 3) {
                for (let x = startX; x < startX + spaceWidth && x < ctx.canvas.width; x += 3) {
                    try {
                        const pixel = ctx.getImageData(x, y, 1, 1).data;
                        const brightness = (pixel[0] + pixel[1] + pixel[2]) / 3;
                        
                        if (brightness < 180) {
                            darkPixels++;
                        }
                        totalPixels++;
                    } catch (e) {
                        // Ignorar errores
                    }
                }
            }
            
            // Si menos del 10% son píxeles oscuros, considerar vacío
            if (totalPixels > 20 && (darkPixels / totalPixels) < 0.1) {
                return {
                    found: true,
                    x: startX + (spaceWidth / 2) - 90, // Centrar la firma
                    y: startY + 10
                };
            }
            
        } catch (error) {
            console.error('Error en checkSpaceAboveLine:', error);
        }
        
        return { found: false, x: 0, y: 0 };
    }

    // ===========================================
    // FUNCIÓN: Buscar área con caja para firma
    // ===========================================
    static findBoxedSignatureArea(ctx, area) {
        try {
            // Buscar rectángulos vacíos
            const boxSize = 90; // Tamaño típico de caja de firma
            
            // Posiciones comunes para cajas de firma
            const possiblePositions = [
                { x: area.x + area.width * 0.7, y: area.y + area.height * 0.2 },
                { x: area.x + area.width * 0.1, y: area.y + area.height * 0.2 },
                { x: area.x + area.width * 0.4, y: area.y + area.height * 0.3 }
            ];
            
            for (const pos of possiblePositions) {
                // Verificar si el área está vacía
                const isEmpty = this.checkAreaEmpty(ctx, pos.x, pos.y, boxSize, 36);
                
                if (isEmpty) {
                    // Verificar bordes (líneas horizontales arriba y abajo)
                    const hasBorders = this.checkAreaBorders(ctx, pos.x, pos.y, boxSize, 36);
                    
                    if (hasBorders) {
                        return {
                            found: true,
                            x: pos.x + 10,
                            y: pos.y + 10,
                            width: boxSize,
                            height: 36
                        };
                    }
                }
            }
            
        } catch (error) {
            console.error('Error en findBoxedSignatureArea:', error);
        }
        
        return { found: false, x: 0, y: 0 };
    }

    // ===========================================
    // FUNCIÓN: Obtener posición basada en tipo de documento
    // ===========================================
    static getDocumentBasedPosition(width, height, ctx) {
        // Determinar el tipo de documento basado en proporciones y contenido
        const isPortrait = height > width * 1.2;
        
        if (isPortrait) {
            // Documentos verticales como CC 30665
            // Firmas suelen estar en la parte inferior izquierda
            return {
                x: width * 0.15,
                y: height * 0.85 - 35
            };
        } else {
            // Documentos horizontales o cuadrados
            // Firmas suelen estar en la parte inferior derecha
            return {
                x: width * 0.7 - 90,
                y: height * 0.8 - 35
            };
        }
    }

    // ===========================================
    // FUNCIONES AUXILIARES NECESARIAS
    // ===========================================

    // Verificar si área tiene bordes
    static checkAreaBorders(ctx, x, y, width, height) {
        try {
            // Verificar línea superior
            let topBorder = 0;
            for (let i = 0; i < width; i += 10) {
                const pixel = ctx.getImageData(x + i, y, 1, 1).data;
                const brightness = (pixel[0] + pixel[1] + pixel[2]) / 3;
                if (brightness < 150) topBorder++;
            }
            
            // Verificar línea inferior
            let bottomBorder = 0;
            for (let i = 0; i < width; i += 10) {
                const pixel = ctx.getImageData(x + i, y + height, 1, 1).data;
                const brightness = (pixel[0] + pixel[1] + pixel[2]) / 3;
                if (brightness < 150) bottomBorder++;
            }
            
            // Si al menos el 40% de los puntos muestreados son oscuros, probablemente es un borde
            return (topBorder > (width / 10) * 0.4) && (bottomBorder > (width / 10) * 0.4);
            
        } catch (error) {
            return false;
        }
    }

    // Buscar espacio vacío debajo
    static findEmptySpaceBelow(ctx, startX, startY, width, searchHeight) {
        const spaceNeeded = 70;
        
        for (let y = startY; y < startY + searchHeight - spaceNeeded; y += 5) {
            for (let x = startX; x < startX + width; x += 5) {
                const isEmpty = this.checkAreaEmpty(ctx, x, y, 80, spaceNeeded);
                if (isEmpty) {
                    return {
                        found: true,
                        x: x,
                        y: y
                    };
                }
            }
        }
        
        return { found: false, x: 0, y: 0 };
    }

    // Verificar si área está vacía
    static checkAreaEmpty(ctx, x, y, width, height) {
        try {
            if (x < 0 || y < 0 || x + width > ctx.canvas.width || y + height > ctx.canvas.height) {
                return false;
            }
            
            let darkPixels = 0;
            let totalPixels = 0;
            const sampleStep = 4;
            
            for (let sy = y; sy < y + height; sy += sampleStep) {
                for (let sx = x; sx < x + width; sx += sampleStep) {
                    try {
                        const pixel = ctx.getImageData(sx, sy, 1, 1).data;
                        const brightness = (pixel[0] + pixel[1] + pixel[2]) / 3;
                        
                        if (brightness < 180) {
                            darkPixels++;
                        }
                        totalPixels++;
                    } catch (e) {
                        // Ignorar errores
                    }
                }
            }
            
            return totalPixels > 10 && (darkPixels / totalPixels) < 0.08;
            
        } catch (error) {
            console.error('Error en checkAreaEmpty:', error);
            return false;
        }
    }

    // ===========================================
    // NUEVO: MÉTODO MEJORADO PARA INTERACTIVIDAD DE FIRMAS (CON SOPORTE MÓVIL NATIVO)
    // ===========================================
    static makeSignatureInteractive(element, signatureData) {
        // Limpiar eventos previos
        element.removeEventListener('mousedown', element._mouseHandler);
        element.removeEventListener('touchstart', element._touchHandler);
        
        // Permitir arrastre
        element.style.touchAction = 'none';
        element.style.userSelect = 'none';
        element.style.webkitUserSelect = 'none';
        
        // Handler para mouse (escritorio)
        const mouseHandler = (e) => {
            if (e.target.classList.contains('signature-handle')) {
                this.startResize(e, element, signatureData);
            } else {
                this.startDrag(e, element, signatureData);
            }
        };
        
        // Handler para touch (móvil) - NATIVO, sin conversión a mouse
        const touchHandler = (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            if (e.touches.length === 1) {
                const touch = e.touches[0];
                const touchX = touch.clientX;
                const touchY = touch.clientY;
                
                // Detectar handle más cercano (radio de 45px para mejor tacto) para entrar en modo redimensión
                // Si no hay handle cercano, entra en modo arrastre
                const handles = element.querySelectorAll('.signature-handle');
                let closestHandle = null;
                let minDistance = 45; // Radio de búsqueda aumentado para facilitar agarre en móvil
                
                handles.forEach(handle => {
                    const rect = handle.getBoundingClientRect();
                    const centerX = rect.left + rect.width / 2;
                    const centerY = rect.top + rect.height / 2;
                    const distance = Math.hypot(touchX - centerX, touchY - centerY);
                    
                    if (distance < minDistance) {
                        minDistance = distance;
                        closestHandle = handle;
                    }
                });

                if (closestHandle) {
                    // Redimensionar usando el handle encontrado
                    this.startResizeTouch(e, element, signatureData, closestHandle);
                } else {
                    // Arrastrar si no hay handle cerca
                    this.startDragTouch(e, element, signatureData);
                }
            }
        };
        
        element._mouseHandler = mouseHandler;
        element._touchHandler = touchHandler;
        
        element.addEventListener('mousedown', mouseHandler);
        element.addEventListener('touchstart', touchHandler, { passive: false });
        
        // Click para seleccionar
        element.addEventListener('click', (e) => {
            e.stopPropagation();
            this.selectSignature(element);
        });
    }

    // ===========================================
    // NUEVO: ARRASTRE NATIVO PARA TOUCH
    // ===========================================
    static startDragTouch(e, element, signatureData) {
        const touch = e.touches[0];
        const canvas = document.getElementById('documentCanvas');
        const startCoords = canvas ? this.getPreciseTouchCoordinates(touch, canvas) : { displayX: touch.clientX, displayY: touch.clientY };
        const startX = startCoords.displayX;
        const startY = startCoords.displayY;
        const startLeft = parseFloat(element.style.left) || 0;
        const startTop = parseFloat(element.style.top) || 0;
        
        const dragMove = (moveEvent) => {
            const currentTouch = moveEvent.touches[0];
            const curCoords = canvas ? this.getPreciseTouchCoordinates(currentTouch, canvas) : { displayX: currentTouch.clientX, displayY: currentTouch.clientY };
            const dx = curCoords.displayX - startX;
            const dy = curCoords.displayY - startY;
            
            let newLeft = startLeft + dx;
            let newTop = startTop + dy;
            
            // Limitar al canvas
            if (canvas) {
                const rect = canvas.getBoundingClientRect();
                const elementRect = element.getBoundingClientRect();
                
                if (newLeft < 0) newLeft = 0;
                if (newTop < 0) newTop = 0;
                if (newLeft + elementRect.width > rect.right - rect.left) {
                    newLeft = rect.right - rect.left - elementRect.width;
                }
                if (newTop + elementRect.height > rect.bottom - rect.top) {
                    newTop = rect.bottom - rect.top - elementRect.height;
                }
            }
            
            element.style.left = newLeft + 'px';
            element.style.top = newTop + 'px';

            // Guardar en coordenadas del canvas (píxeles reales), no en CSS
            try {
                const canvas = document.getElementById('documentCanvas');
                if (canvas) {
                    const rect = canvas.getBoundingClientRect();
                    const displayWidth = rect.width || parseFloat(canvas.style.width) || canvas.width;
                    const displayHeight = rect.height || parseFloat(canvas.style.height) || canvas.height;
                    const pixelWidth = canvas.width;
                    const pixelHeight = canvas.height;

                    if (displayWidth > 0 && displayHeight > 0) {
                        signatureData.x = Math.round((newLeft / displayWidth) * pixelWidth);
                        signatureData.y = Math.round((newTop / displayHeight) * pixelHeight);
                        // Actualizar valores normalizados
                        signatureData.normX = +(signatureData.x / pixelWidth) || 0;
                        signatureData.normY = +(signatureData.y / pixelHeight) || 0;
                    } else {
                        signatureData.x = Math.round(newLeft);
                        signatureData.y = Math.round(newTop);
                        signatureData.normX = 0;
                        signatureData.normY = 0;
                    }
                } else {
                    signatureData.x = Math.round(newLeft);
                    signatureData.y = Math.round(newTop);
                    signatureData.normX = 0;
                    signatureData.normY = 0;
                }
            } catch (err) {
                signatureData.x = Math.round(newLeft);
                signatureData.y = Math.round(newTop);
                signatureData.normX = 0;
                signatureData.normY = 0;
            }
        };
        
        const dragEnd = () => {
            document.removeEventListener('touchmove', dragMove, { passive: false });
            document.removeEventListener('touchend', dragEnd, { passive: false });
            document.removeEventListener('touchcancel', dragEnd, { passive: false });
        };
        
        document.addEventListener('touchmove', dragMove, { passive: false });
        document.addEventListener('touchend', dragEnd, { passive: false });
        document.addEventListener('touchcancel', dragEnd, { passive: false });
    }

    // ===========================================
    // NUEVO: REDIMENSIÓN NATIVA PARA TOUCH
    // ===========================================
    static startResizeTouch(e, element, signatureData, passedHandle) {
        const touch = e.touches[0];
        const canvas = document.getElementById('documentCanvas');
        // Usar el handle detectado previamente si está disponible
        let handleClass = passedHandle?.className || '';
        let classListArr = Array.isArray(passedHandle?.classList) ? Array.from(passedHandle.classList) : (handleClass ? handleClass.split(' ') : []);
        if (!handleClass) {
            // elementFromPoint requiere coordenadas de viewport (clientX/clientY)
            const handle = document.elementFromPoint(touch.clientX, touch.clientY);
            handleClass = handle?.className || '';
            classListArr = Array.isArray(handle?.classList) ? Array.from(handle.classList) : (handleClass ? handleClass.split(' ') : []);
        }
        const isRight = classListArr.includes('handle-right') || classListArr.includes('handle-top-right') || classListArr.includes('handle-bottom-right');
        const isLeft = classListArr.includes('handle-left') || classListArr.includes('handle-top-left') || classListArr.includes('handle-bottom-left');
        const isTop = classListArr.includes('handle-top') || classListArr.includes('handle-top-left') || classListArr.includes('handle-top-right');
        const isBottom = classListArr.includes('handle-bottom') || classListArr.includes('handle-bottom-left') || classListArr.includes('handle-bottom-right');
        const startCoords = canvas ? this.getPreciseTouchCoordinates(touch, canvas) : { displayX: touch.clientX, displayY: touch.clientY };
        const startX = startCoords.displayX;
        const startY = startCoords.displayY;
        const startWidth = parseFloat(element.style.width) || element.offsetWidth;
        const startHeight = parseFloat(element.style.height) || element.offsetHeight;
        const startLeft = parseFloat(element.style.left) || 0;
        const startTop = parseFloat(element.style.top) || 0;
        
        const minWidth = 50;
        const minHeight = 30;
        
        const resizeMove = (moveEvent) => {
            const currentTouch = moveEvent.touches[0];
            const curCoords = canvas ? this.getPreciseTouchCoordinates(currentTouch, canvas) : { displayX: currentTouch.clientX, displayY: currentTouch.clientY };
            const dx = curCoords.displayX - startX;
            const dy = curCoords.displayY - startY;
            
            let newWidth = startWidth;
            let newHeight = startHeight;
            let newLeft = startLeft;
            let newTop = startTop;
            
            if (isRight) {
                newWidth = Math.max(minWidth, startWidth + dx);
            }
            if (isLeft) {
                newWidth = Math.max(minWidth, startWidth - dx);
                newLeft = startLeft + dx;
            }
            if (isBottom) {
                newHeight = Math.max(minHeight, startHeight + dy);
            }
            if (isTop) {
                newHeight = Math.max(minHeight, startHeight - dy);
                newTop = startTop + dy;
            }
            
            element.style.width = newWidth + 'px';
            element.style.height = newHeight + 'px';
            element.style.left = newLeft + 'px';
            element.style.top = newTop + 'px';
            
            // Convertir tamaño CSS a tamaño en píxeles del canvas
            try {
                const canvas = document.getElementById('documentCanvas');
                if (canvas) {
                    const rect = canvas.getBoundingClientRect();
                    const displayWidth = rect.width || parseFloat(canvas.style.width) || canvas.width;
                    const displayHeight = rect.height || parseFloat(canvas.style.height) || canvas.height;
                    const pixelWidth = canvas.width;
                    const pixelHeight = canvas.height;

                    if (displayWidth > 0 && displayHeight > 0) {
                        signatureData.width = Math.round((newWidth / displayWidth) * pixelWidth);
                        signatureData.height = Math.round((newHeight / displayHeight) * pixelHeight);
                        signatureData.normWidth = +(signatureData.width / pixelWidth) || 0;
                        signatureData.normHeight = +(signatureData.height / pixelHeight) || 0;
                    } else {
                        signatureData.width = Math.round(newWidth);
                        signatureData.height = Math.round(newHeight);
                        signatureData.normWidth = 0;
                        signatureData.normHeight = 0;
                    }
                } else {
                    signatureData.width = Math.round(newWidth);
                    signatureData.height = Math.round(newHeight);
                }
            } catch (err) {
                signatureData.width = Math.round(newWidth);
                signatureData.height = Math.round(newHeight);
            }
            // Guardar en coordenadas del canvas (píxeles reales), no en CSS
            try {
                const canvas = document.getElementById('documentCanvas');
                if (canvas) {
                    const rect = canvas.getBoundingClientRect();
                    const displayWidth = rect.width || parseFloat(canvas.style.width) || canvas.width;
                    const displayHeight = rect.height || parseFloat(canvas.style.height) || canvas.height;
                    const pixelWidth = canvas.width;
                    const pixelHeight = canvas.height;

                    if (displayWidth > 0 && displayHeight > 0) {
                        signatureData.x = Math.round((newLeft / displayWidth) * pixelWidth);
                        signatureData.y = Math.round((newTop / displayHeight) * pixelHeight);
                        signatureData.normX = +(signatureData.x / pixelWidth) || 0;
                        signatureData.normY = +(signatureData.y / pixelHeight) || 0;
                    } else {
                        signatureData.x = Math.round(newLeft);
                        signatureData.y = Math.round(newTop);
                        signatureData.normX = 0;
                        signatureData.normY = 0;
                    }
                } else {
                    signatureData.x = Math.round(newLeft);
                    signatureData.y = Math.round(newTop);
                    signatureData.normX = 0;
                    signatureData.normY = 0;
                }
            } catch (err) {
                signatureData.x = Math.round(newLeft);
                signatureData.y = Math.round(newTop);
                signatureData.normX = 0;
                signatureData.normY = 0;
            }
        };
        
        const resizeEnd = () => {
            document.removeEventListener('touchmove', resizeMove, { passive: false });
            document.removeEventListener('touchend', resizeEnd, { passive: false });
            document.removeEventListener('touchcancel', resizeEnd, { passive: false });
        };
        
        document.addEventListener('touchmove', resizeMove, { passive: false });
        document.addEventListener('touchend', resizeEnd, { passive: false });
        document.addEventListener('touchcancel', resizeEnd, { passive: false });
    }

    // ===========================================
    // NUEVO: MÉTODO MEJORADO PARA ARRASTRAR (MOUSE/ESCRITORIO)
    // ===========================================
    static startDrag(e, element, signatureData) {
        e.preventDefault();
        e.stopPropagation();
        
        const startX = e.clientX;
        const startY = e.clientY;
        const startLeft = parseFloat(element.style.left) || 0;
        const startTop = parseFloat(element.style.top) || 0;
        
        const dragMove = (moveEvent) => {
            const dx = moveEvent.clientX - startX;
            const dy = moveEvent.clientY - startY;
            
            let newLeft = startLeft + dx;
            let newTop = startTop + dy;
            
            // Limitar al canvas
            const canvas = document.getElementById('documentCanvas');
            if (canvas) {
                const rect = canvas.getBoundingClientRect();
                const elementRect = element.getBoundingClientRect();
                
                if (newLeft < 0) newLeft = 0;
                if (newTop < 0) newTop = 0;
                if (newLeft + elementRect.width > rect.right - rect.left) {
                    newLeft = rect.right - rect.left - elementRect.width;
                }
                if (newTop + elementRect.height > rect.bottom - rect.top) {
                    newTop = rect.bottom - rect.top - elementRect.height;
                }
            }
            
            element.style.left = newLeft + 'px';
            element.style.top = newTop + 'px';
            
            // Guardar en coordenadas del canvas (píxeles reales), no en CSS
            try {
                const canvas = document.getElementById('documentCanvas');
                if (canvas) {
                    const rect = canvas.getBoundingClientRect();
                    const displayWidth = rect.width || parseFloat(canvas.style.width) || canvas.width;
                    const displayHeight = rect.height || parseFloat(canvas.style.height) || canvas.height;
                    const pixelWidth = canvas.width;
                    const pixelHeight = canvas.height;

                    if (displayWidth > 0 && displayHeight > 0) {
                        signatureData.x = Math.round((newLeft / displayWidth) * pixelWidth);
                        signatureData.y = Math.round((newTop / displayHeight) * pixelHeight);
                        // Actualizar valores normalizados para que el zoom funcione correctamente
                        signatureData.normX = +(signatureData.x / pixelWidth) || 0;
                        signatureData.normY = +(signatureData.y / pixelHeight) || 0;
                    } else {
                        signatureData.x = Math.round(newLeft);
                        signatureData.y = Math.round(newTop);
                        signatureData.normX = 0;
                        signatureData.normY = 0;
                    }
                } else {
                    signatureData.x = Math.round(newLeft);
                    signatureData.y = Math.round(newTop);
                }
            } catch (err) {
                signatureData.x = Math.round(newLeft);
                signatureData.y = Math.round(newTop);
            }
        };
        
        const dragEnd = () => {
            document.removeEventListener('mousemove', dragMove);
            document.removeEventListener('mouseup', dragEnd);
        };
        
        document.addEventListener('mousemove', dragMove);
        document.addEventListener('mouseup', dragEnd);
    }

    // ===========================================
    // NUEVO: MÉTODO MEJORADO PARA REDIMENSIONAR (MOUSE/ESCRITORIO)
    // ===========================================
    static startResize(e, element, signatureData) {
        e.preventDefault();
        e.stopPropagation();
        
        const handle = e.target;
        const classListArr = Array.from(handle.classList);
        const isRight = classListArr.includes('handle-right') || classListArr.includes('handle-top-right') || classListArr.includes('handle-bottom-right');
        const isLeft = classListArr.includes('handle-left') || classListArr.includes('handle-top-left') || classListArr.includes('handle-bottom-left');
        const isTop = classListArr.includes('handle-top') || classListArr.includes('handle-top-left') || classListArr.includes('handle-top-right');
        const isBottom = classListArr.includes('handle-bottom') || classListArr.includes('handle-bottom-left') || classListArr.includes('handle-bottom-right');
        
        const startX = e.clientX;
        const startY = e.clientY;
        const startWidth = parseFloat(element.style.width) || element.offsetWidth;
        const startHeight = parseFloat(element.style.height) || element.offsetHeight;
        const startLeft = parseFloat(element.style.left) || 0;
        const startTop = parseFloat(element.style.top) || 0;
        
        const minWidth = 50;
        const minHeight = 30;
        
        const resizeMove = (moveEvent) => {
            const dx = moveEvent.clientX - startX;
            const dy = moveEvent.clientY - startY;
            
            let newWidth = startWidth;
            let newHeight = startHeight;
            let newLeft = startLeft;
            let newTop = startTop;
            
            if (isRight) {
                newWidth = Math.max(minWidth, startWidth + dx);
            }
            if (isLeft) {
                newWidth = Math.max(minWidth, startWidth - dx);
                newLeft = startLeft + dx;
            }
            if (isBottom) {
                newHeight = Math.max(minHeight, startHeight + dy);
            }
            if (isTop) {
                newHeight = Math.max(minHeight, startHeight - dy);
                newTop = startTop + dy;
            }
            
            element.style.width = newWidth + 'px';
            element.style.height = newHeight + 'px';
            element.style.left = newLeft + 'px';
            element.style.top = newTop + 'px';
            
            // Guardar tamaño y posición en coordenadas del canvas (píxeles reales)
            try {
                const canvas = document.getElementById('documentCanvas');
                if (canvas) {
                    const rect = canvas.getBoundingClientRect();
                    const displayWidth = rect.width || parseFloat(canvas.style.width) || canvas.width;
                    const displayHeight = rect.height || parseFloat(canvas.style.height) || canvas.height;
                    const pixelWidth = canvas.width;
                    const pixelHeight = canvas.height;

                    if (displayWidth > 0 && displayHeight > 0) {
                        signatureData.width = Math.round((newWidth / displayWidth) * pixelWidth);
                        signatureData.height = Math.round((newHeight / displayHeight) * pixelHeight);
                        signatureData.x = Math.round((newLeft / displayWidth) * pixelWidth);
                        signatureData.y = Math.round((newTop / displayHeight) * pixelHeight);
                        signatureData.normWidth = +(signatureData.width / pixelWidth) || 0;
                        signatureData.normHeight = +(signatureData.height / pixelHeight) || 0;
                        signatureData.normX = +(signatureData.x / pixelWidth) || 0;
                        signatureData.normY = +(signatureData.y / pixelHeight) || 0;
                    } else {
                        signatureData.width = Math.round(newWidth);
                        signatureData.height = Math.round(newHeight);
                        signatureData.x = Math.round(newLeft);
                        signatureData.y = Math.round(newTop);
                        signatureData.normWidth = 0;
                        signatureData.normHeight = 0;
                        signatureData.normX = 0;
                        signatureData.normY = 0;
                    }
                } else {
                    signatureData.width = Math.round(newWidth);
                    signatureData.height = Math.round(newHeight);
                    signatureData.x = Math.round(newLeft);
                    signatureData.y = Math.round(newTop);
                    signatureData.normWidth = 0;
                    signatureData.normHeight = 0;
                    signatureData.normX = 0;
                    signatureData.normY = 0;
                }
            } catch (err) {
                signatureData.width = Math.round(newWidth);
                signatureData.height = Math.round(newHeight);
                signatureData.x = Math.round(newLeft);
                signatureData.y = Math.round(newTop);
                signatureData.normWidth = 0;
                signatureData.normHeight = 0;
                signatureData.normX = 0;
                signatureData.normY = 0;
            }
        };
        
        const resizeEnd = () => {
            document.removeEventListener('mousemove', resizeMove);
            document.removeEventListener('mouseup', resizeEnd);
        };
        
        document.addEventListener('mousemove', resizeMove);
        document.addEventListener('mouseup', resizeEnd);
    }

    static selectSignature(element) {
        // Deseleccionar todas las firmas
        document.querySelectorAll('.document-signature').forEach(sig => {
            sig.classList.remove('selected');
        });
        
        // Seleccionar esta firma
        element.classList.add('selected');
        
        // En móvil, mostrar feedback visual
        if (this.isTouchDevice) {
            // Agregar pulso de selección
            element.classList.add('mobile-selected');
            
            // Quitar el efecto después de 1 segundo
            setTimeout(() => {
                element.classList.remove('mobile-selected');
            }, 1000);
        }
    }

    // ===========================================
    // MÉTODOS EXISTENTES (mantener igual)
    // ===========================================

    static calculateOptimalDocumentSize(originalWidth, originalHeight, qualityMultiplier = 1) {
        const viewerContent = document.getElementById('viewerContent');
        if (!viewerContent) {
            return { width: originalWidth, height: originalHeight };
        }
        
        const containerWidth = viewerContent.clientWidth - 80;
        const containerHeight = viewerContent.clientHeight - 80;
        
        // Calcular escala inicial basada en el contenedor
        const scaleX = containerWidth / originalWidth;
        const scaleY = containerHeight / originalHeight;
        let scale = Math.min(scaleX, scaleY, 1.5) * qualityMultiplier;
        
        const minWidth = 600;
        const minHeight = 400;
        
        // Ajustar escala si es necesario para cumplir con dimensiones mínimas
        // (En lugar de ajustar width/height independientemente que rompe el aspect ratio)
        if (originalWidth * scale < minWidth) {
            scale = minWidth / originalWidth;
        }
        
        // Si después de ajustar por ancho, el alto sigue siendo menor al mínimo
        if (originalHeight * scale < minHeight) {
            scale = Math.max(scale, minHeight / originalHeight);
        }
        
        // Calcular dimensiones finales basadas en la escala unificada
        const width = originalWidth * scale;
        const height = originalHeight * scale;
        
        return { 
            width: Math.round(width), 
            height: Math.round(height),
            scale: scale
        };
    }

    static showLoadingMessage(canvas, ctx) {
        canvas.width = 600;
        canvas.height = 400;
        
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.fillStyle = '#2f6c46';
        ctx.font = 'bold 20px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Cargando documento...', canvas.width / 2, canvas.height / 2);
        
        ctx.fillStyle = '#6c8789';
        ctx.font = '16px Arial';
        ctx.fillText('Por favor espere', canvas.width / 2, canvas.height / 2 + 30);
    }

    static showErrorMessage(canvas, ctx, message) {
        canvas.width = 600;
        canvas.height = 400;
        
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.fillStyle = '#e74c3c';
        ctx.font = 'bold 20px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Error', canvas.width / 2, canvas.height / 2 - 20);
        
        ctx.fillStyle = '#333';
        ctx.font = '16px Arial';
        ctx.fillText(message, canvas.width / 2, canvas.height / 2 + 10);
        
        ctx.fillStyle = '#6c8789';
        ctx.font = '14px Arial';
        ctx.fillText('Intente cargar el documento nuevamente', canvas.width / 2, canvas.height / 2 + 40);
    }

    static async loadDocument(file) {
        return new Promise((resolve) => {
            console.log('📄 loadDocument INICIADO:', file.name, 'con', (file.signatures || []).length, 'firmas');
            
            this.documentSignatures = [];
            this.currentSignature = null;
            this.currentZoom = 1.0;

            const signatureLayer = document.getElementById('signatureLayer');
            if (signatureLayer) {
                signatureLayer.innerHTML = '';
            }

            this.currentDocument = {
                id: file.id,
                name: file.name,
                type: file.type,
                url: file.url,
                uploadDate: file.uploadDate || new Date(),
                uploadedBy: file.uploadedBy || AppState.currentUser.uid,
                uploadedByName: file.uploadedByName || AppState.currentUser.name,
                signatures: file.signatures || [],
                pages: file.pages || 1,
                size: file.size,
                extension: file.extension,
                source: file.source || 'uploaded'  // 'uploaded' o 'signed'
            };

            // Reset PDF cache and page state for the newly loaded document
            this.pdfDocument = null;
            this.pdfDocumentUrl = null;
            this.currentPage = 1;
            this.totalPages = 1;
            
            // CARGAR METADATOS DE FIRMAS SI EXISTEN
            // Si el documento viene como 'signed' (firmado), las firmas
            // ya están integradas en la imagen, pero queremos conservar
            // la metadata para mostrar la lista de firmantes y permitir
            // agregar firmas adicionales. Marcar las firmas previas como
            // `bakedIn: true` para evitar render visual duplicado.
            if (file.signatures && file.signatures.length > 0) {
                this.documentSignatures = file.signatures.map(sig => ({
                    ...sig,
                    bakedIn: file.source === 'signed' ? true : (sig.bakedIn || false)
                }));
                console.log('✅ Firmas cargadas para', file.name, ':', this.documentSignatures.length);
            } else {
                this.documentSignatures = [];
                console.log('⭕ Sin firmas para', file.name);
            }

            // Asegurar que el documento actual tenga la metadata de firmas
            // y actualizar la vista inmediatamente para evitar mostrar
            // firmas de un documento anterior.
            this.currentDocument.signatures = this.documentSignatures;
            console.log('🔄 Llamando renderSignaturesList desde loadDocument para:', file.name);
            this.renderSignaturesList();
            
            setTimeout(async () => {
                try {
                    await this.renderDocument();
                    this.renderDocumentSelector();
                    console.log('🔄 Llamando renderSignaturesList desde setTimeout para:', file.name);
                    this.renderSignaturesList();
                    this.initializeDocumentInteractions();
                    
                    this.applyRealZoom();
                    // Crear controles de paginación para documentos multipágina
                    this.createPageControls();
                    
                    showNotification(`Documento "${file.name}" cargado`);
                    resolve(this.currentDocument);
                } catch (error) {
                    console.error('Error al cargar documento:', error);
                    showNotification('Error al cargar el documento: ' + error.message, 'error');
                    resolve(null);
                }
            }, 100);
        });
    }

    static async renderDocument() {
        const noDocument = document.getElementById('noDocument');
        const documentContainer = document.getElementById('documentContainer');
        const canvas = document.getElementById('documentCanvas');
        const ctx = canvas.getContext('2d');

        if (!this.currentDocument) {
            if (noDocument) noDocument.style.display = 'block';
            if (documentContainer) documentContainer.style.display = 'none';
            return;
        }

        if (noDocument) noDocument.style.display = 'none';
        if (documentContainer) documentContainer.style.display = 'block';

        try {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            this.showLoadingMessage(canvas, ctx);

            if (this.currentDocument.type === 'application/pdf') {
                await this.renderPDFDocument(canvas, ctx);
            } else if (this.currentDocument.type.startsWith('image/')) {
                await this.renderImageDocument(canvas, ctx);
            } else {
                await this.renderGenericDocument(canvas, ctx);
            }

            // ============================================
            // NUEVO: Copiar contenido al canvas de análisis
            // ============================================
            const analysisCanvas = document.getElementById('analysisCanvas');
            if (analysisCanvas) {
                analysisCanvas.width = canvas.width;
                analysisCanvas.height = canvas.height;
                const analysisCtx = analysisCanvas.getContext('2d');
                analysisCtx.drawImage(canvas, 0, 0, canvas.width, canvas.height);
                
                console.log('✅ Canvas de análisis preparado:', 
                        analysisCanvas.width, 'x', analysisCanvas.height);
            }

            this.renderExistingSignatures();
            
            this.adjustContainerSize();
            
        } catch (error) {
            console.error('Error al renderizar documento:', error);
            this.showErrorMessage(canvas, ctx, 'Error al cargar el documento');
        }
    }

    static adjustContainerSize() {
        const canvas = document.getElementById('documentCanvas');
        const container = document.getElementById('documentContainer');
        const signatureLayer = document.getElementById('signatureLayer');
        
        if (canvas && container) {
            const displayWidth = canvas.width;
            const displayHeight = canvas.height;
            
            canvas.style.width = displayWidth + 'px';
            canvas.style.height = displayHeight + 'px';
            
            container.style.width = displayWidth + 'px';
            container.style.height = displayHeight + 'px';
            
            if (signatureLayer) {
                signatureLayer.style.width = displayWidth + 'px';
                signatureLayer.style.height = displayHeight + 'px';
                signatureLayer.style.transform = 'none';
            }
            
            this.currentZoom = 1.0;
            this.applyRealZoom();
            
            this.documentSignatures.forEach(signature => {
                const signatureElement = document.querySelector(`[data-signature-id="${signature.id}"]`);
                if (signatureElement) {
                    signatureElement.style.left = signature.x + 'px';
                    signatureElement.style.top = signature.y + 'px';
                    signatureElement.style.width = signature.width + 'px';
                    signatureElement.style.height = signature.height + 'px';
                    signatureElement.style.transform = 'none';
                }
            });
        }
    }

    static async renderPDFDocument(canvas, ctx) {
        // Nueva implementación: soporta render de página específica en `this.currentPage`
        const pageNumber = this.currentPage || 1;
        try {
            let pdfUrl = this.currentDocument.url;

            // Si es un placeholder, mostrar mensaje
            if (pdfUrl.includes('placeholder')) {
                this.showPDFFallback(canvas, ctx);
                return;
            }

            // Cargar y cachear PDF si no está cargado o es distinto
            if (!this.pdfDocument || this.pdfDocumentUrl !== pdfUrl) {
                const loadingTask = pdfjsLib.getDocument(pdfUrl);
                this.pdfDocument = await loadingTask.promise;
                this.pdfDocumentUrl = pdfUrl;
                this.totalPages = this.pdfDocument.numPages || 1;
                console.log('PDF cargado, páginas =', this.totalPages);
            }

            // Clamp page
            const pageIndex = Math.min(Math.max(1, pageNumber), this.totalPages);
            const page = await this.pdfDocument.getPage(pageIndex);

            const viewport = page.getViewport({ scale: 1 });
            const originalWidth = viewport.width;
            const originalHeight = viewport.height;

            const optimalSize = this.calculateOptimalDocumentSize(originalWidth, originalHeight, 1.5);

            canvas.width = optimalSize.width;
            canvas.height = optimalSize.height;

            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';

            const optimalViewport = page.getViewport({ scale: optimalSize.scale });

            const renderContext = {
                canvasContext: ctx,
                viewport: optimalViewport
            };

            // Cancel previous render task if still running to avoid canvas conflicts
            try {
                if (this.lastRenderTask && typeof this.lastRenderTask.cancel === 'function') {
                    this.lastRenderTask.cancel();
                }
            } catch (cancelErr) {
                console.warn('Error cancelando render anterior:', cancelErr);
            }

            const renderTask = page.render(renderContext);
            this.lastRenderTask = renderTask;
            await renderTask.promise;
            this.lastRenderTask = null;

        } catch (error) {
            console.error('Error al renderizar PDF:', error);
            this.showPDFFallback(canvas, ctx);
        }
    }

    // ==============================
    // MÓVIL: Obtener coordenadas precisas
    // ==============================
    static getPreciseTouchCoordinates(touch, canvas) {
        try {
            const rect = canvas.getBoundingClientRect();

            // Convertir a coordenadas de viewport sin doble restar scroll
            // (evita desplazamientos al colocar/mover en móviles con scroll)
            const clientX = (touch.pageX !== undefined) ? (touch.pageX - window.scrollX) : touch.clientX;
            const clientY = (touch.pageY !== undefined) ? (touch.pageY - window.scrollY) : touch.clientY;

            const displayX = clientX - rect.left;
            const displayY = clientY - rect.top;

            // Mapping de display (CSS) -> canvas pixel
            const scaleX = rect.width > 0 ? (canvas.width / rect.width) : 1;
            const scaleY = rect.height > 0 ? (canvas.height / rect.height) : 1;

            const x = displayX * scaleX;
            const y = displayY * scaleY;

            return {
                x: Math.max(0, x),
                y: Math.max(0, y),
                displayX: displayX,
                displayY: displayY,
                scaleX, scaleY
            };
        } catch (err) {
            console.warn('getPreciseTouchCoordinates error', err);
            return { x: 0, y: 0, displayX: 0, displayY: 0, scaleX: 1, scaleY: 1 };
        }
    }

    static showPDFFallback(canvas, ctx) {
        const optimalSize = this.calculateOptimalDocumentSize(800, 1000);
        canvas.width = optimalSize.width;
        canvas.height = optimalSize.height;
        
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.strokeStyle = '#e1e5e9';
        ctx.lineWidth = 2;
        ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);
        
        ctx.fillStyle = '#2f6c46';
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(this.currentDocument.name, canvas.width / 2, 60);
        
        ctx.fillStyle = '#333';
        ctx.font = '16px Arial';
        ctx.textAlign = 'left';
        
        const infoLines = [
            'Documento cargado desde el sistema',
            `Tipo: ${this.currentDocument.type}`,
            `Tamaño: ${FileService.formatFileSize(this.currentDocument.size || 0)}`,
            `Subido por: ${this.currentDocument.uploadedByName}`
        ];
        
        let y = 100;
        infoLines.forEach(line => {
            ctx.fillText(line, 50, y);
            y += 30;
        });
        
        ctx.fillStyle = '#6c8789';
        ctx.font = 'italic 14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Para ver el contenido completo, descarga el archivo', canvas.width / 2, canvas.height - 50);
    }

    static async renderImageDocument(canvas, ctx) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const originalWidth = img.naturalWidth;
                const originalHeight = img.naturalHeight;
                
                const optimalSize = this.calculateOptimalDocumentSize(originalWidth, originalHeight, 1.2);
                
                canvas.width = optimalSize.width;
                canvas.height = optimalSize.height;
                
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                
                ctx.drawImage(img, 0, 0, optimalSize.width, optimalSize.height);
                resolve();
            };
            img.onerror = () => {
                this.renderImageFallback(canvas, ctx);
                resolve();
            };
            img.src = this.currentDocument.url;
        });
    }

    static renderImageFallback(canvas, ctx) {
        const optimalSize = this.calculateOptimalDocumentSize(600, 400);
        canvas.width = optimalSize.width;
        canvas.height = optimalSize.height;
        
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.fillStyle = '#2f6c46';
        ctx.font = 'bold 20px Arial';
        ctx.fillText('IMAGEN NO CARGADA', 50, 50);
        
        ctx.fillStyle = '#666';
        ctx.font = '16px Arial';
        ctx.fillText('Nombre: ' + this.currentDocument.name, 50, 100);
    }

    static async renderGenericDocument(canvas, ctx) {
        const optimalSize = this.calculateOptimalDocumentSize(800, 600);
        canvas.width = optimalSize.width;
        canvas.height = optimalSize.height;
        
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        const fileInfo = FileService.getFileIcon(this.currentDocument.type, this.currentDocument.name);
        
        const bgColors = {
            'word': '#e8f4f8',
            'excel': '#f0f8f0',
            'powerpoint': '#fdf0e8',
            'pdf': '#f8e8e8',
            'text': '#f8f8f8',
            'archive': '#fff8e8',
            'generic': '#f0f0f0'
        };
        
        ctx.fillStyle = bgColors[fileInfo.type] || '#f0f0f0';
        ctx.fillRect(20, 20, canvas.width - 40, canvas.height - 40);
        
        ctx.fillStyle = fileInfo.color;
        ctx.font = 'bold 72px Arial';
        ctx.textAlign = 'center';
        
        if (fileInfo.type === 'word') {
            ctx.fillText('W', canvas.width / 2, 150);
        } else if (fileInfo.type === 'excel') {
            ctx.fillText('X', canvas.width / 2, 150);
        } else if (fileInfo.type === 'powerpoint') {
            ctx.fillText('P', canvas.width / 2, 150);
        } else if (fileInfo.type === 'pdf') {
            ctx.fillText('PDF', canvas.width / 2, 150);
        } else {
            ctx.fillText('DOC', canvas.width / 2, 150);
        }
        
        ctx.fillStyle = '#2f6c46';
        ctx.font = 'bold 20px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('DOCUMENTO - ' + this.currentDocument.name.toUpperCase(), canvas.width / 2, 200);
        
        ctx.fillStyle = '#333';
        ctx.font = '16px Arial';
        ctx.textAlign = 'left';
        
        const infoLines = [
            `Nombre: ${this.currentDocument.name}`,
            `Tipo: ${FileService.getFileTypeDisplayName(fileInfo.type)}`,
            `Extensión: .${this.currentDocument.extension || 'doc'}`,
            `Tamaño: ${FileService.formatFileSize(this.currentDocument.size)}`,
            `Subido por: ${this.currentDocument.uploadedBy}`,
            `Fecha: ${this.currentDocument.uploadDate.toLocaleDateString('es-ES')}`
        ];
        
        let yPosition = 240;
        infoLines.forEach(line => {
            ctx.fillText(line, 60, yPosition);
            yPosition += 30;
        });
        
        ctx.fillStyle = '#6c8789';
        ctx.font = 'italic 14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Este es un documento cargado en el sistema. Puedes agregar firmas digitales.', canvas.width / 2, canvas.height - 40);
        
        ctx.strokeStyle = '#e1e5e9';
        ctx.lineWidth = 2;
        ctx.strokeRect(20, 20, canvas.width - 40, canvas.height - 40);
    }

    static zoomIn() {
        this.currentZoom = Math.min(this.currentZoom + 0.25, 3.0);
        this.applyRealZoom();
    }

    static zoomOut() {
        this.currentZoom = Math.max(this.currentZoom - 0.25, 0.5);
        this.applyRealZoom();
    }

    static applyRealZoom() {
        const canvas = document.getElementById('documentCanvas');
        const container = document.getElementById('documentContainer');
        const signatureLayer = document.getElementById('signatureLayer');
        
        if (canvas && container) {
            // Mantener dimensiones reales del canvas
            const originalWidth = canvas.width;
            const originalHeight = canvas.height;
            
            // Calcular dimensiones visuales (solo CSS, no atributos)
            const scaledWidth = originalWidth * this.currentZoom;
            const scaledHeight = originalHeight * this.currentZoom;
            
            // Aplicar zoom SOLO a la escala visual (transform), no al canvas físico
            const zoomValue = this.currentZoom;
            
            // Usar transform para zoom real (no cambia atributos del canvas)
            canvas.style.transform = `scale(${zoomValue})`;
            canvas.style.transformOrigin = 'top left';
            
            // Ajustar container para acomodar el tamaño escalado
            container.style.width = scaledWidth + 'px';
            container.style.height = scaledHeight + 'px';
            
            if (signatureLayer) {
                signatureLayer.style.width = scaledWidth + 'px';
                signatureLayer.style.height = scaledHeight + 'px';
            }
            
            this.repositionSignaturesForZoom();
        }
        
        const zoomLevel = document.getElementById('zoomLevel');
        if (zoomLevel) zoomLevel.textContent = `${Math.round(this.currentZoom * 100)}%`;
    }

    static repositionSignaturesForZoom() {
        const canvas = document.getElementById('documentCanvas');
        const signatureLayer = document.getElementById('signatureLayer');
        if (!canvas || !signatureLayer) return;
        
        // Obtener dimensiones de visualización (considerar transform CSS cuando exista)
        const displayRect = canvas.getBoundingClientRect();
        const computedStyle = window.getComputedStyle(canvas);
        const transform = computedStyle?.transform || 'none';

        let displayWidth, displayHeight;
        if (transform && transform !== 'none') {
            // Cuando hay transform CSS (scale), el bounding rect ya refleja la escala
            displayWidth = displayRect.width;
            displayHeight = displayRect.height;
        } else {
            // Sin transform, preferir offsetWidth/offsetHeight (layout size)
            displayWidth = canvas.offsetWidth || displayRect.width;
            displayHeight = canvas.offsetHeight || displayRect.height;
        }

        // El canvas.width/height son las dimensiones en píxeles de la superficie de dibujo
        const pixelWidth = canvas.width;
        const pixelHeight = canvas.height;

        // Actualizar capa de firmas para coincidir con el tamaño escalado
        signatureLayer.style.width = displayWidth + 'px';
        signatureLayer.style.height = displayHeight + 'px';
        
        // Reposicionar cada firma (usar norm* si existe)
        this.documentSignatures.forEach(signature => {
            const signatureElement = document.querySelector(`[data-signature-id="${signature.id}"]`);
            if (signatureElement) {
                // Calcular posición escalada basada en coordenadas normalizadas o fallback
                const relX = (typeof signature.normX === 'number') ? signature.normX : (signature.x / pixelWidth);
                const relY = (typeof signature.normY === 'number') ? signature.normY : (signature.y / pixelHeight);
                const relW = (typeof signature.normWidth === 'number') ? signature.normWidth : (signature.width / pixelWidth);
                const relH = (typeof signature.normHeight === 'number') ? signature.normHeight : (signature.height / pixelHeight);

                const scaledX = relX * displayWidth;
                const scaledY = relY * displayHeight;
                const scaledWidth = relW * displayWidth;
                const scaledHeight = relH * displayHeight;

                signatureElement.style.left = scaledX + 'px';
                signatureElement.style.top = scaledY + 'px';
                signatureElement.style.width = scaledWidth + 'px';
                signatureElement.style.height = scaledHeight + 'px';
            }
        });
    }

    static renderExistingSignatures() {
        const signatureLayer = document.getElementById('signatureLayer');
        if (!signatureLayer) return;
        signatureLayer.innerHTML = '';

        const canvas = document.getElementById('documentCanvas');
        if (canvas) {
            signatureLayer.style.width = canvas.style.width;
            signatureLayer.style.height = canvas.style.height;
        }

        // Renderizar solo las firmas interactivas (no las "bakedIn")
        // Además, mostrar solo las firmas correspondientes a la página actual
        const pageToShow = this.currentPage || 1;
        this.documentSignatures.forEach(signature => {
            if (signature.bakedIn) return; // evitar duplicar firmas ya integradas en la imagen
            // Si la firma tiene asignada una página, compararla; si no, asumir página 1
            const sigPage = signature.page || 1;
            if (sigPage !== pageToShow) return;
            const signatureElement = this.createSignatureElement(signature);
            signatureLayer.appendChild(signatureElement);
        });

        this.repositionSignaturesForZoom();
    }

    // ==========================
    // Paginación de PDF
    // ==========================
    static async goToPage(n) {
        if (!this.currentDocument) return;
        const target = Math.min(Math.max(1, n), this.totalPages || 1);
        this.currentPage = target;
        const canvas = document.getElementById('documentCanvas');
        const ctx = canvas.getContext('2d');
        await this.renderPDFDocument(canvas, ctx);
        this.renderExistingSignatures();
        this.renderSignaturesList();
        this.updatePageControls();
    }

    static nextPage() {
        return this.goToPage((this.currentPage || 1) + 1);
    }

    static prevPage() {
        return this.goToPage((this.currentPage || 1) - 1);
    }

    static createPageControls() {
        const container = document.getElementById('documentContainer');
        if (!container) return;

        // Evitar duplicar controles
        let controls = document.getElementById('pageControls');
        if (!controls) {
            controls = document.createElement('div');
            controls.id = 'pageControls';
            controls.style.position = 'absolute';
            controls.style.right = '12px';
            controls.style.top = '12px';
            controls.style.zIndex = 9999;
            controls.style.display = 'flex';
            controls.style.gap = '6px';

            const prev = document.createElement('button');
            prev.className = 'btn btn-outline';
            prev.id = 'prevPageBtn';
            prev.innerHTML = '<i class="fas fa-chevron-left"></i>';
            prev.addEventListener('click', () => this.prevPage());

            const pageInfo = document.createElement('div');
            pageInfo.id = 'pageInfo';
            pageInfo.style.color = 'white';
            pageInfo.style.padding = '8px 12px';
            pageInfo.style.background = 'rgba(0,0,0,0.45)';
            pageInfo.style.borderRadius = '6px';

            const next = document.createElement('button');
            next.className = 'btn btn-outline';
            next.id = 'nextPageBtn';
            next.innerHTML = '<i class="fas fa-chevron-right"></i>';
            next.addEventListener('click', () => this.nextPage());

            controls.appendChild(prev);
            controls.appendChild(pageInfo);
            controls.appendChild(next);
            container.style.position = 'relative';
            container.appendChild(controls);
        }

        this.updatePageControls();
    }

    static updatePageControls() {
        const pageInfo = document.getElementById('pageInfo');
        if (!pageInfo) return;
        pageInfo.textContent = `${this.currentPage || 1} / ${this.totalPages || 1}`;
        const prev = document.getElementById('prevPageBtn');
        const next = document.getElementById('nextPageBtn');
        if (prev) prev.disabled = (this.currentPage || 1) <= 1;
        if (next) next.disabled = (this.currentPage || 1) >= (this.totalPages || 1);
    }

    static createSignatureElement(signature) {
        const signatureElement = document.createElement('div');
        signatureElement.className = 'document-signature';
        // Calcular posición en base al tamaño mostrado del canvas
        const canvas = document.getElementById('documentCanvas');
        if (canvas) {
            const rect = canvas.getBoundingClientRect();
            const displayWidth = rect.width || parseFloat(canvas.style.width) || canvas.width;
            const displayHeight = rect.height || parseFloat(canvas.style.height) || canvas.height;
            const pixelWidth = canvas.width;
            const pixelHeight = canvas.height;

            // Preferir coordenadas normalizadas si están presentes
            const left = (typeof signature.normX === 'number' ? signature.normX : (signature.x / pixelWidth)) * displayWidth;
            const top = (typeof signature.normY === 'number' ? signature.normY : (signature.y / pixelHeight)) * displayHeight;
            const w = (typeof signature.normWidth === 'number' ? signature.normWidth : (signature.width / pixelWidth)) * displayWidth;
            const h = (typeof signature.normHeight === 'number' ? signature.normHeight : (signature.height / pixelHeight)) * displayHeight;

            signatureElement.style.left = left + 'px';
            signatureElement.style.top = top + 'px';
            signatureElement.style.width = w + 'px';
            signatureElement.style.height = h + 'px';
        } else {
            signatureElement.style.left = signature.x + 'px';
            signatureElement.style.top = signature.y + 'px';
            signatureElement.style.width = signature.width + 'px';
            signatureElement.style.height = signature.height + 'px';
        }
        signatureElement.dataset.signatureId = signature.id;
        
        signatureElement.innerHTML = `
            <img src="${signature.data}" alt="Firma de ${signature.userName}" onerror="this.style.display='none'" style="image-rendering: -webkit-optimize-contrast; image-rendering: crisp-edges; background: transparent !important;">
            <div class="signature-handle handle-top-left"></div>
            <div class="signature-handle handle-top-right"></div>
            <div class="signature-handle handle-bottom-left"></div>
            <div class="signature-handle handle-bottom-right"></div>
        `;
        
            // Hacer la firma interactiva: arrastre y redimensión (mouse y touch)
            this.makeSignatureInteractive(signatureElement, signature);
            return signatureElement;
    }

    // ===========================================
    static enableSignatureMode() {
        console.log('%c🔵 enableSignatureMode activado', 'color: #2196F3; font-weight: bold; font-size: 14px');
        
        if (!this.currentSignature) {
            console.warn('%c⚠️ No hay firma seleccionada', 'color: #ff9800');
            showNotification('No hay firma seleccionada', 'error');
            return;
        }

        this.isSignatureMode = true;
        document.body.classList.add('signature-mode-active');
        
        const canvas = document.getElementById('documentCanvas');
        const viewerContent = document.getElementById('viewerContent');
        
        console.log('%c📍 Canvas encontrado: ' + !!canvas, 'color: ' + (canvas ? '#4caf50' : '#f44336'));
        console.log('%c📍 ViewerContent encontrado: ' + !!viewerContent, 'color: ' + (viewerContent ? '#4caf50' : '#f44336'));
        
        if (!canvas || !viewerContent) {
            showNotification('Canvas no encontrado - intenta recargar', 'error');
            this.isSignatureMode = false;
            return;
        }
        
        // Cambiar cursor
        canvas.style.cursor = 'crosshair';
        viewerContent.style.cursor = 'crosshair';
        showNotification('👆 Toca o haz clic donde deseas colocar la firma');
        
        // IMPORTANTE: Limpieza completa de listeners previos
        if (this._oldClickHandler) {
            document.removeEventListener('click', this._oldClickHandler, true);
            console.log('%c✓ Old click handler removido del document', 'color: #ff9800');
        }
        if (this._oldTouchHandler) {
            document.removeEventListener('touchend', this._oldTouchHandler, true);
            console.log('%c✓ Old touch handler removido del document', 'color: #ff9800');
        }
        
        // Crear nuevos handlers con closure adecuado
        const clickHandler = (e) => {
            console.log('%c🖱️ CLICK DETECTADO en:', 'color: #2196F3; font-weight: bold', e.target?.id || e.target?.className || 'elemento');
            console.log('isSignatureMode:', this.isSignatureMode);
            console.log('currentSignature:', !!this.currentSignature);
            console.log('Event target:', e.target?.tagName, e.target?.id);
            
            // Verificar que el click fue en el canvas o en la zona del documento
            const clickedOnDocument = e.target === canvas || 
                                     e.target?.id === 'documentCanvas' ||
                                     viewerContent?.contains(e.target);
            
            console.log('%c✓ Click en documento:', 'color: ' + (clickedOnDocument ? '#4caf50' : '#f44336'), clickedOnDocument);
            
            if (!clickedOnDocument) {
                console.log('%c⚠️ Click fuera del documento, ignorando', 'color: #ff9800');
                return;
            }
            
            if (!this.isSignatureMode) {
                console.warn('%c❌ isSignatureMode es false', 'color: #f44336');
                return;
            }
            
            if (!this.currentSignature) {
                console.warn('%c❌ No hay currentSignature', 'color: #f44336');
                return;
            }
            
            console.log('%c✅ Condiciones válidas, procesando click', 'color: #4caf50; font-weight: bold');
            
            // Obtener coordenadas relativas al canvas
            const rect = canvas.getBoundingClientRect();
            console.log('%c📐 Canvas rect:', 'color: #9c27b0', { left: rect.left, top: rect.top, width: rect.width, height: rect.height });
            console.log('%c📐 Canvas actual size:', 'color: #9c27b0', { width: canvas.width, height: canvas.height });
            
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            console.log('%c📏 Scale factors:', 'color: #673ab7', { scaleX, scaleY });
            
            const displayX = e.clientX - rect.left;
            const displayY = e.clientY - rect.top;
            const x = displayX * scaleX;
            const y = displayY * scaleY;
            
            console.log(`%c📍 Display coords: (${Math.round(displayX)}, ${Math.round(displayY)})`, 'color: #4caf50');
            console.log(`%c📍 Pixel coords: (${Math.round(x)}, ${Math.round(y)})`, 'color: #4caf50; font-weight: bold');
            
            // Prevenir que se propague
            e.stopPropagation();
            e.preventDefault();
            
            // DESACTIVAR INMEDIATAMENTE
            this.isSignatureMode = false;
            document.body.classList.remove('signature-mode-active');
            canvas.style.cursor = 'default';
            viewerContent.style.cursor = 'auto';
            
            // Remover listeners del documento (EN EL DOCUMENT, no en canvas)
            document.removeEventListener('click', clickHandler, true);
            document.removeEventListener('touchend', touchHandler, true);
            console.log('%c✓ Listeners removidos del document', 'color: #4caf50');
            
            // Agregar firma CON DELAY
            setTimeout(() => {
                console.log(`%c📍 Llamando addSignatureToDocument con (${Math.round(x)}, ${Math.round(y)})`, 'color: #9c27b0; font-weight: bold');
                this.addSignatureToDocument(x, y);
            }, 50);
        };
        
        // Handler para toque (móvil)
        const touchHandler = (e) => {
            console.log('%c👆 TOUCH DETECTADO en:', 'color: #ff9800; font-weight: bold', e.target?.id || e.target?.className || 'elemento');
            
            // Verificar que el touch fue en el canvas o en la zona del documento
            const touchedOnDocument = e.target === canvas || 
                                     e.target?.id === 'documentCanvas' ||
                                     viewerContent?.contains(e.target);
            
            if (!touchedOnDocument) {
                console.log('%c⚠️ Touch fuera del documento, ignorando', 'color: #ff9800');
                return;
            }
            
            if (!this.isSignatureMode) {
                console.warn('%c❌ isSignatureMode es false (touch)', 'color: #f44336');
                return;
            }
            
            if (!this.currentSignature) {
                console.warn('%c❌ No hay currentSignature (touch)', 'color: #f44336');
                return;
            }
            
            if (!e.changedTouches || e.changedTouches.length === 0) {
                console.warn('%c❌ Sin touch points', 'color: #f44336');
                return;
            }
            
            console.log('%c✅ Condiciones válidas (touch), procesando', 'color: #4caf50; font-weight: bold');
            
            const touch = e.changedTouches[0];
            // Usar helper para coordenadas precisas en móvil (pageX/pageY + scroll)
            const coords = this.getPreciseTouchCoordinates(touch, canvas);
            const displayX = coords.displayX;
            const displayY = coords.displayY;
            const x = coords.x;
            const y = coords.y;

            console.log(`%c📍 Display coords (móvil): (${Math.round(displayX)}, ${Math.round(displayY)})`, 'color: #ff9800');
            console.log(`%c📍 Pixel coords (móvil): (${Math.round(x)}, ${Math.round(y)})`, 'color: #ff9800; font-weight: bold');
            
            // Prevenir scroll
            e.stopPropagation();
            e.preventDefault();
            
            // DESACTIVAR INMEDIATAMENTE
            this.isSignatureMode = false;
            document.body.classList.remove('signature-mode-active');
            canvas.style.cursor = 'default';
            viewerContent.style.cursor = 'auto';
            
            // Remover listeners
            document.removeEventListener('click', clickHandler, true);
            document.removeEventListener('touchend', touchHandler, { passive: false, capture: true });
            console.log('%c✓ Listeners removidos del document', 'color: #ff9800');
            
            // Agregar firma CON DELAY
            setTimeout(() => {
                console.log(`%c📍 Llamando addSignatureToDocument con (${Math.round(x)}, ${Math.round(y)})`, 'color: #9c27b0; font-weight: bold');
                this.addSignatureToDocument(x, y);
            }, 50);
        };
        
        // Guardar referencias
        this._oldClickHandler = clickHandler;
        this._oldTouchHandler = touchHandler;
        
        // Agregar listeners AL DOCUMENTO (capture phase = true para interceptar antes)
        console.log('%c🔗 Agregando listeners al DOCUMENT (capture phase)', 'color: #673ab7; font-weight: bold');
        document.addEventListener('click', clickHandler, true);
        document.addEventListener('touchend', touchHandler, { passive: false, capture: true });
        console.log('%c✓ Listeners agregados - Esperando clic/toque del usuario...', 'color: #4caf50; font-weight: bold; font-size: 14px');
    }

    /*
    static handleCanvasClick(e) {
        if (!this.isSignatureMode || !this.currentSignature) {
            return;
        }
        
        const canvas = document.getElementById('documentCanvas');
        if (!canvas) return;
        
        const rect = canvas.getBoundingClientRect();
        
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;
        
        this.addSignatureToDocument(x, y);
        this.disableSignatureMode();
    }
    */

    // ===========================================
    // REEMPLAZAR: disableSignatureMode
    // ===========================================
    static disableSignatureMode() {
        this.isSignatureMode = false;
        document.body.classList.remove('signature-mode-active');
        
        const canvas = document.getElementById('documentCanvas');
        const signatureLayer = document.getElementById('signatureLayer');
        
        if (canvas) canvas.style.cursor = 'default';
        if (signatureLayer) signatureLayer.style.pointerEvents = 'auto';
        
        // Ya no hay event listener que remover
        this.canvasClickHandler = null;
    }

    // ===========================================
    // MODIFICAR addSignatureToDocument para modo automático inteligente
    // ===========================================
    static async addSignatureToDocument(manualX = null, manualY = null) {
        console.log('🟢 addSignatureToDocument llamado con:', { manualX, manualY });
        
        if (!this.currentSignature) {
            console.warn('⚠️ No hay firma seleccionada');
            showNotification('No hay firma seleccionada', 'error');
            return;
        }

        if (!this.currentDocument) {
            console.warn('⚠️ No hay documento seleccionado');
            showNotification('Primero selecciona un documento', 'error');
            return;
        }

        try {
            let position;
            
            // Si el usuario especificó una posición (clic/toque), usarla
            if (manualX !== null && manualY !== null) {
                console.log(`📍 Usando posición del usuario: (${Math.round(manualX)}, ${Math.round(manualY)})`);
                position = {
                    x: manualX,
                    y: manualY,
                    fieldType: 'user_click',
                    confidence: 1.0
                };
            } else {
                // Fallback: buscar automáticamente si no hay posición manual
                console.log('🔍 Buscando ubicación automática...');
                const autoPosition = await this.findSignaturePosition();
                position = autoPosition;
                console.log('🎯 Posición encontrada:', position);
            }
            
            // Calcular tamaño de la firma
            let width = 90;
            let height = 36;
            
            if (this.currentSignature.type === 'upload') {
                const img = new Image();
                img.src = this.currentSignature.data;
                
                await new Promise((resolve, reject) => {
                    img.onload = resolve;
                    img.onerror = reject;
                });
                
                width = img.naturalWidth;
                height = img.naturalHeight;
                
                const maxWidth = 110;
                const maxHeight = 45;
                
                if (width > maxWidth || height > maxHeight) {
                    const ratio = Math.min(maxWidth / width, maxHeight / height);
                    width = Math.round(width * ratio);
                    height = Math.round(height * ratio);
                }
            }
            
            // Asegurar que está dentro del documento
            const canvas = document.getElementById('documentCanvas');
            if (canvas) {
                if (position.x < 10) position.x = 10;
                if (position.y < 10) position.y = 10;
                if (position.x + width > canvas.width - 10) {
                    position.x = canvas.width - width - 10;
                }
                if (position.y + height > canvas.height - 10) {
                    position.y = canvas.height - height - 10;
                }
            }
            
            // Crear objeto de firma
            const signature = {
                id: 'sig_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                data: this.currentSignature.data,
                userName: AppState.currentUser.name,
                userEmail: AppState.currentUser.email,
                page: this.currentPage || 1,
                x: position.x,
                y: position.y,
                width: width,
                height: height,
            // Coordenadas normalizadas respecto al canvas (0..1) para ser independientes
            // del zoom CSS y del tamaño visual del canvas.
                normX: (function(){
                    try { const c = document.getElementById('documentCanvas'); return c && c.width ? (position.x / c.width) : 0; } catch(e){return 0}
                })(),
                normY: (function(){
                    try { const c = document.getElementById('documentCanvas'); return c && c.height ? (position.y / c.height) : 0; } catch(e){return 0}
                })(),
                normWidth: (function(){
                    try { const c = document.getElementById('documentCanvas'); return c && c.width ? (width / c.width) : 0; } catch(e){return 0}
                })(),
                normHeight: (function(){
                    try { const c = document.getElementById('documentCanvas'); return c && c.height ? (height / c.height) : 0; } catch(e){return 0}
                })(),
                timestamp: new Date(),
                type: this.currentSignature.type,
                placedBy: 'user_placement',
                confidence: position.confidence,
                fieldType: position.fieldType
            };
            
            // Log de diagnóstico: coordenadas y normalizadas (útil para móvil con zoom)
            try {
                const rect = document.getElementById('documentCanvas')?.getBoundingClientRect();
                console.log('📝 Firma creada:', {
                    id: signature.id,
                    page: signature.page,
                    x: Math.round(signature.x),
                    y: Math.round(signature.y),
                    width: Math.round(signature.width),
                    height: Math.round(signature.height),
                    normX: signature.normX,
                    normY: signature.normY,
                    normWidth: signature.normWidth,
                    normHeight: signature.normHeight,
                    canvasRect: rect ? { left: Math.round(rect.left), top: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height) } : null
                });
            } catch (logErr) {
                console.warn('Error log firma:', logErr);
            }

            // Agregar firma a la lista
            this.documentSignatures.push(signature);
            if (this.currentDocument) {
                this.currentDocument.signatures = this.documentSignatures;
            }
            
            // Actualizar interfaz
            this.renderExistingSignatures();
            this.renderSignaturesList();
            
            // Mostrar notificación
            showNotification(`✓ Firma colocada. Puedes mover y redimensionar`);
            showNotification(`✓ Firma colocada. Puedes mover y redimensionar con el ratón/táctil`);
            
        } catch (error) {
            console.error('❌ Error al agregar firma:', error);
            showNotification('Error al colocar la firma', 'error');
        }
    }

    // ===========================================
    // REEMPLAZAR: setCurrentSignature
    // ===========================================
    static setCurrentSignature(signatureData) {
        console.log('🔷 setCurrentSignature llamado con:', signatureData);
        this.currentSignature = signatureData;
        console.log('✓ currentSignature asignado');
        this.enableSignatureMode();
    }

    static clearAllSignatures() {
        this.documentSignatures = [];
        if (this.currentDocument) {
            this.currentDocument.signatures = [];
        }
        this.renderExistingSignatures();
        this.renderSignaturesList();
        showNotification('Todas las firmas removidas', 'warning');
    }

    static renderSignaturesList() {
        const signaturesGrid = document.getElementById('signaturesGrid');
        const noSignatures = document.getElementById('noSignatures');
        
        console.log('🎯 renderSignaturesList LLAMADO. signaturesGrid exists:', !!signaturesGrid, 'noSignatures exists:', !!noSignatures);
        
        if (!signaturesGrid || !noSignatures) {
            console.warn('❌ signaturesGrid o noSignatures no encontrados. Saliendo.');
            return;
        }
        // Prefer signatures from the currently loaded document to avoid
        // showing stale signatures from a previously opened file.
        const signatures = (this.currentDocument && Array.isArray(this.currentDocument.signatures))
            ? this.currentDocument.signatures
            : this.documentSignatures || [];

        // Keep internal array in sync
        this.documentSignatures = signatures;

        console.log('renderSignaturesList: currentDocument=', this.currentDocument ? this.currentDocument.id : 'none', 'signaturesCount=', signatures.length);

        if (signatures.length === 0) {
            console.log('✅ Mostrando "No hay firmas"');
            noSignatures.style.display = 'flex';
            // Vaciar los badges pero MANTENER noSignatures en el DOM
            signaturesGrid.querySelectorAll('.signature-badge').forEach(el => el.remove());
            return;
        }

        console.log('✅ Renderizando', signatures.length, 'firmas');
        noSignatures.style.display = 'none';
        
        // Vaciar solo los badges, NO borrar toda la grilla (evita eliminar noSignatures)
        signaturesGrid.querySelectorAll('.signature-badge').forEach(el => el.remove());

        signatures.forEach((signature, idx) => {
            console.log('  📌 Firma', idx + 1, ':', signature.userName);
            const signatureBadge = document.createElement('div');
            signatureBadge.className = 'signature-badge';
            signatureBadge.innerHTML = `
                <div class="signature-avatar">${(signature.userName || '').substring(0, 2).toUpperCase()}</div>
                <div class="signature-user">${signature.userName || 'Desconocido'}</div>
            `;
            signaturesGrid.appendChild(signatureBadge);
        });
        console.log('✅ renderSignaturesList completado');
    }

    static removeSignature(signatureId) {
        const index = this.documentSignatures.findIndex(sig => sig.id === signatureId);
        if (index > -1) {
            this.documentSignatures.splice(index, 1);
            if (this.currentDocument) {
                this.currentDocument.signatures = this.documentSignatures;
            }
            this.renderExistingSignatures();
            this.renderSignaturesList();
            showNotification('Firma removida', 'warning');
        }
    }

    static renderDocumentSelector() {
        const selector = document.getElementById('documentSelector');
        if (!selector) return;

        selector.innerHTML = '<option value="">Seleccionar documento...</option>';
        
        if (!FileService || !FileService.files) {
            console.error('FileService.files no está disponible');
            return;
        }
        
        // Mostrar TODOS los archivos (tanto subidos como firmados)
        const allFiles = FileService.files;
        
        // Ordenar por fecha (más reciente primero)
        const sortedFiles = [...allFiles].sort((a, b) => {
            const dateA = a.uploadDate?.toDate?.() || a.uploadDate || new Date(0);
            const dateB = b.uploadDate?.toDate?.() || b.uploadDate || new Date(0);
            return dateB - dateA;
        });
        
        console.log('Archivos disponibles para selector:', sortedFiles.length);
        
        sortedFiles.forEach(file => {
            const fileInfo = FileService.getFileIcon(file.type, file.name);
            const option = document.createElement('option');
            option.value = file.id;
            
            // Marcar archivos firmados con un indicador
            const signedIndicator = file.source === 'signed' ? ' [Firmado]' : '';
            option.textContent = `${file.name} (${FileService.getFileTypeDisplayName(fileInfo.type)})${signedIndicator}`;
            
            if (this.currentDocument && this.currentDocument.id === file.id) {
                option.selected = true;
            }
            selector.appendChild(option);
        });
        
        // Auto-seleccionar el primer archivo si no hay ninguno seleccionado
        if (sortedFiles.length > 0 && (!this.currentDocument || selector.value === "")) {
            selector.value = sortedFiles[0].id;
            // Cargar automáticamente el primer documento
            const file = sortedFiles[0];
            setTimeout(() => {
                console.log('Cargando documento automáticamente:', file.name);
                this.loadDocument(file);
            }, 100);
        } else if (sortedFiles.length === 0) {
            console.log('No hay archivos para mostrar en el selector');
        }
    }

    static refreshDocumentSelector() {
        this.renderDocumentSelector();
    }

    // ===========================================
    // REEMPLAZAR: initializeDocumentInteractions
    // ===========================================
    static initializeDocumentInteractions() {
        const container = document.getElementById('documentContainer');
        const canvas = document.getElementById('documentCanvas');
        
        if (container && canvas) {
            container.addEventListener('dragstart', (e) => {
                e.preventDefault();
            });
            
            container.style.touchAction = 'manipulation';
            
            // Eliminar cualquier event listener de clic anterior
            canvas.removeEventListener('click', DocumentService.handleCanvasClick);
        }
    }

    static handleCanvasResize() {
        const canvas = document.getElementById('documentCanvas');
        const container = document.getElementById('documentContainer');
        
        if (canvas && container && this.currentDocument) {
            if (container.style.display !== 'none') {
                setTimeout(() => {
                    this.adjustContainerSize();
                }, 100);
            }
        }
    }

    static loadUserSettings() {
        if (!AppState.currentUser) return;
        
        const userFullName = document.getElementById('userFullName');
        const userEmail = document.getElementById('userEmail');
        
        if (userFullName) userFullName.value = AppState.currentUser.name;
        if (userEmail) userEmail.value = AppState.currentUser.email;
        
        if (userFullName) {
            userFullName.addEventListener('change', function() {
                AppState.currentUser.name = this.value;
                const storage = new CloudStorageService();
                storage.getUser(AppState.currentUser.email).then(user => {
                    if (user) {
                        user.name = this.value;
                        storage.saveUser(user);
                    }
                });
                showNotification('Nombre actualizado correctamente');
            });
        }
        
        if (userEmail) {
            userEmail.addEventListener('change', function() {
                showNotification('El correo electrónico no se puede modificar', 'warning');
                this.value = AppState.currentUser.email;
            });
        }
    }
   
    static cleanup() {
        console.log('Limpiando recursos de documentos...');
        if (this.currentDocument && this.currentDocument.url && 
            this.currentDocument.url.startsWith('blob:')) {
            try {
                URL.revokeObjectURL(this.currentDocument.url);
            } catch (error) {
                console.warn('Error al liberar URL del documento:', error);
            }
        }
        this.currentDocument = null;
        this.documentSignatures = [];
        this.currentZoom = 1.0;
    }
}

// ===========================================
// FIN DE LA CLASE DOCUMENT SERVICE MEJORADA
// ===========================================

let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        DocumentService.handleCanvasResize();
    }, 250);
});

// Sistema de Exportación de Documentos con Firmas
class DocumentExportService {
    static async combineSignaturesWithDocument() {
        if (!DocumentService.currentDocument) {
            throw new Error('No hay documento seleccionado');
        }

        if (DocumentService.documentSignatures.length === 0) {
            throw new Error('No hay firmas para combinar');
        }

        showNotification('Combinando firmas con documento...');

        try {
            if (DocumentService.currentDocument.type === 'application/pdf') {
                // Forzar ruta robusta basada en canvas para respetar rotaciones/orientaciones
                return await this.combineWithPDF();
            } else if (DocumentService.currentDocument.type.startsWith('image/')) {
                return await this.combineWithImage();
            } else {
                return await this.combineWithGenericDocument();
            }
        } catch (error) {
            console.error('Error al combinar firmas:', error);
            throw new Error('Error al combinar las firmas con el documento: ' + error.message);
        }
    }

    static async combineWithPDFDirect() {
        try {
            const { PDFDocument } = window.PDFLib;
            const response = await fetch(DocumentService.currentDocument.url, { cache: 'no-store' });
            const originalPdfBytes = await response.arrayBuffer();
            const pdfDoc = await PDFDocument.load(originalPdfBytes, { updateMetadata: false });
            const pages = pdfDoc.getPages();
            const displayCanvas = document.getElementById('documentCanvas');
            const pixelWidth = displayCanvas?.width || pages[0]?.getSize()?.width || 1;
            const pixelHeight = displayCanvas?.height || pages[0]?.getSize()?.height || 1;
            
            for (let i = 0; i < pages.length; i++) {
                const page = pages[i];
                const { width: pageWidth, height: pageHeight } = page.getSize();
                const signatures = (DocumentService.documentSignatures || []).filter(s => (s.page || 1) === (i + 1));
                for (const s of signatures) {
                    let embeddedImage;
                    const isPng = (s.data || '').startsWith('data:image/png');
                    if (isPng) {
                        embeddedImage = await pdfDoc.embedPng(s.data);
                    } else {
                        embeddedImage = await pdfDoc.embedJpg(s.data);
                    }
                    const drawWidth = (typeof s.normWidth === 'number')
                        ? (s.normWidth * pageWidth)
                        : (((s.width || embeddedImage.width) / pixelWidth) * pageWidth);
                    const drawHeight = (typeof s.normHeight === 'number')
                        ? (s.normHeight * pageHeight)
                        : (((s.height || embeddedImage.height) / pixelHeight) * pageHeight);
                    const x = (typeof s.normX === 'number')
                        ? (s.normX * pageWidth)
                        : (((s.x || 0) / pixelWidth) * pageWidth);
                    const yTop = (typeof s.normY === 'number')
                        ? (s.normY * pageHeight)
                        : (((s.y || 0) / pixelHeight) * pageHeight);
                    const y = pageHeight - yTop - drawHeight;
                    page.drawImage(embeddedImage, { x, y, width: drawWidth, height: drawHeight });
                }
            }
            const pdfBytes = await pdfDoc.save({ useObjectStreams: true });
            const blob = new Blob([pdfBytes], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);
            return { blob: blob, url: url, type: 'application/pdf', fileName: `documento_firmado_${Date.now()}.pdf` };
        } catch (error) {
            console.error('Error en combineWithPDFDirect:', error);
            throw error;
        }
    }

    static async combineWithPDF() {
        return new Promise(async (resolve, reject) => {
            try {
                const loadingTask = pdfjsLib.getDocument(DocumentService.currentDocument.url);
                const pdf = await loadingTask.promise;
                const numPages = pdf.numPages || 1;

                const displayCanvas = document.getElementById('documentCanvas');
                const signatureLayer = document.getElementById('signatureLayer');

                // Canvas por página para composición visual 1:1
                const { jsPDF } = window.jspdf;
                let pdfOutput = null;

                for (let p = 1; p <= numPages; p++) {
                    const page = await pdf.getPage(p);
                    // Aumentar escala a 3.0 para mejor resolución (evitar pixelado)
                    const scale = 3.0;
                    const viewport = page.getViewport({ scale });
                    const viewportPts = page.getViewport({ scale: 1 }); // Tamaño original de la página en puntos

                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    canvas.width = viewport.width;
                    canvas.height = viewport.height;

                    ctx.imageSmoothingEnabled = true;
                    ctx.imageSmoothingQuality = 'high';

                    // Rellenar fondo blanco para asegurar que JPEG no salga negro en transparencias
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);

                    const renderContext = { canvasContext: ctx, viewport };
                    await page.render(renderContext).promise;

                    // Dibujar firmas que correspondan a esta página
                    if (displayCanvas && signatureLayer) {
                        // Usar getBoundingClientRect() para obtener el tamaño visual
                        // (puede estar escalado por CSS transform o zoom del navegador)
                        const displayRect = displayCanvas.getBoundingClientRect();
                        const viewerPixelWidth = displayRect.width || canvas.width;
                        const viewerPixelHeight = displayRect.height || canvas.height;

                        const scaleFactorX = canvas.width / viewerPixelWidth;
                        const scaleFactorY = canvas.height / viewerPixelHeight;

                        // Seleccionar firmas del documento que tienen page == p (o undefined->1)
                        const signatures = (DocumentService.documentSignatures || []).filter(s => (s.page || 1) === p);
                        console.log(`combineWithPDF: renderizando página ${p}, firmas = ${signatures.length}`, { scaleFactorX, scaleFactorY });

                        for (const s of signatures) {
                            try {
                                const img = new Image();
                                img.src = s.data;
                                await this.waitForImageLoad(img);

                                // Usar coordenadas normalizadas si existen (más robusto cuando hay zoom/transform)
                                const x = (typeof s.normX === 'number' ? s.normX * canvas.width : (s.x || 0) * scaleFactorX);
                                const y = (typeof s.normY === 'number' ? s.normY * canvas.height : (s.y || 0) * scaleFactorY);
                                const width = (typeof s.normWidth === 'number' ? s.normWidth * canvas.width : (s.width || img.naturalWidth) * scaleFactorX);
                                const height = (typeof s.normHeight === 'number' ? s.normHeight * canvas.height : (s.height || img.naturalHeight) * scaleFactorY);

                                ctx.imageSmoothingEnabled = true;
                                ctx.imageSmoothingQuality = 'high';
                                console.log('combineWithPDF: dibujando firma', { id: s.id, page: p, x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height), useNorm: typeof s.normX === 'number' });
                                ctx.drawImage(img, x, y, width, height);
                            } catch (innerErr) {
                                console.error('combineWithPDF: error dibujando firma fallback', innerErr, s);
                            }
                        }
                    }

                    // Añadir página al jsPDF usando tamaño ORIGINAL de la página (pt) y orientación detectada
                    const isLandscape = viewportPts.width > viewportPts.height;
                    const orientation = isLandscape ? 'landscape' : 'portrait';

                    if (!pdfOutput) {
                        pdfOutput = new jsPDF({
                            orientation: orientation,
                            unit: 'pt',
                            format: [viewportPts.width, viewportPts.height]
                        });
                        // Usar calidad alta (0.95) y compresión SLOW para mejor resultado visual
                        const imgData = canvas.toDataURL('image/jpeg', 0.95);
                        pdfOutput.addImage(imgData, 'JPEG', 0, 0, viewportPts.width, viewportPts.height, undefined, 'SLOW');
                    } else {
                        pdfOutput.addPage([viewportPts.width, viewportPts.height], orientation);
                        const imgData = canvas.toDataURL('image/jpeg', 0.95);
                        pdfOutput.addImage(imgData, 'JPEG', 0, 0, viewportPts.width, viewportPts.height, undefined, 'SLOW');
                    }
                }

                const pdfBlob = pdfOutput.output('blob');
                const pdfUrl = URL.createObjectURL(pdfBlob);

                resolve({ blob: pdfBlob, url: pdfUrl, type: 'application/pdf', fileName: `documento_firmado_${Date.now()}.pdf` });

            } catch (error) {
                console.error('Error en combineWithPDF:', error);
                reject(error);
            }
        });
    }

    static async combineWithImage() {
        return new Promise(async (resolve, reject) => {
            try {
                const img = new Image();
                img.src = DocumentService.currentDocument.url;
                await new Promise((resolve, reject) => {
                    img.onload = resolve;
                    img.onerror = reject;
                });
                
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                canvas.width = img.naturalWidth;
                canvas.height = img.naturalHeight;
                
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                
                const displayCanvas = document.getElementById('documentCanvas');
                const signatureLayer = document.getElementById('signatureLayer');

                if (!displayCanvas || !signatureLayer) {
                    console.warn('combineWithImage: canvas o signatureLayer no encontrados');
                } else {
                    // Usar el tamaño visual actual del canvas (bounding rect)
                    const displayRect = displayCanvas.getBoundingClientRect();
                    const viewerPixelWidth = displayRect.width || canvas.width;
                    const viewerPixelHeight = displayRect.height || canvas.height;

                    const scaleFactorX = canvas.width / viewerPixelWidth;
                    const scaleFactorY = canvas.height / viewerPixelHeight;

                    const signatures = (DocumentService.documentSignatures || []).filter(s => (s.page || 1) === (DocumentService.currentPage || 1));
                    console.log(`combineWithImage: firmas detectadas = ${signatures.length}`, { scaleFactorX, scaleFactorY });

                    for (const s of signatures) {
                        try {
                            const imgSignature = new Image();
                            imgSignature.src = s.data;
                            await this.waitForImageLoad(imgSignature);

                            // Prefer normalized coordinates (norm*) si están disponibles
                            const x = (typeof s.normX === 'number' ? s.normX * canvas.width : (s.x || 0) * scaleFactorX);
                            const y = (typeof s.normY === 'number' ? s.normY * canvas.height : (s.y || 0) * scaleFactorY);
                            const width = (typeof s.normWidth === 'number' ? s.normWidth * canvas.width : (s.width || imgSignature.naturalWidth) * scaleFactorX);
                            const height = (typeof s.normHeight === 'number' ? s.normHeight * canvas.height : (s.height || imgSignature.naturalHeight) * scaleFactorY);

                            ctx.imageSmoothingEnabled = true;
                            ctx.imageSmoothingQuality = 'high';
                            console.log('combineWithImage: dibujando firma', { id: s.id, page: DocumentService.currentPage, x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height), useNorm: typeof s.normX === 'number' });
                            try {
                                ctx.drawImage(imgSignature, x, y, width, height);
                            } catch (drawErr) {
                                console.error('Error dibujando imagen de firma en image canvas:', drawErr, { x, y, width, height, imgSrc: imgSignature.src });
                            }
                        } catch (inner) {
                            console.warn('combineWithImage: fallo cargando firma', inner, s);
                        }
                    }
                }
                
                canvas.toBlob((blob) => {
                    const url = URL.createObjectURL(blob);
                    resolve({
                        blob: blob,
                        url: url,
                        type: 'image/png',
                        fileName: `documento_firmado_${Date.now()}.png`
                    });
                }, 'image/png', 1.0);

            } catch (error) {
                console.error('Error en combineWithImage:', error);
                reject(error);
            }
        });
    }

    static async combineWithGenericDocument() {
        return new Promise((resolve, reject) => {
            try {
                const viewerContent = document.getElementById('viewerContent');
                
                html2canvas(viewerContent, {
                    useCORS: true,
                    allowTaint: true,
                    scale: 3,
                    logging: false,
                    width: viewerContent.scrollWidth,
                    height: viewerContent.scrollHeight,
                    windowWidth: viewerContent.scrollWidth,
                    windowHeight: viewerContent.scrollHeight
                }).then(canvas => {
                    const highQualityCanvas = document.createElement('canvas');
                    const ctx = highQualityCanvas.getContext('2d');
                    
                    highQualityCanvas.width = canvas.width;
                    highQualityCanvas.height = canvas.height;
                    
                    ctx.imageSmoothingEnabled = true;
                    ctx.imageSmoothingQuality = 'high';
                    
                    ctx.drawImage(canvas, 0, 0);
                    
                    highQualityCanvas.toBlob((blob) => {
                        const url = URL.createObjectURL(blob);
                        resolve({
                            blob: blob,
                            url: url,
                            type: 'image/png',
                            fileName: `documento_firmado_${Date.now()}.png`
                        });
                    }, 'image/png', 1.0);
                    
                }).catch(error => {
                    reject(error);
                });

            } catch (error) {
                reject(error);
            }
        });
    }

    static waitForImageLoad(img) {
        return new Promise((resolve, reject) => {
            if (img.complete && img.naturalWidth !== 0) {
                resolve();
            } else {
                img.addEventListener('load', () => resolve());
                img.addEventListener('error', () => reject(new Error('Error al cargar la imagen de la firma')));
            }
        });
    }

    static downloadCombinedDocument(blob, fileName) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}

// ===========================================
// ALGORITMO INTELIGENTE DE DETECCIÓN DE CAMPOS DE FIRMA
// ===========================================
class SignatureFieldDetector {
    static async detectAllSignatureFields(canvas) {
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        
        console.log('🔍 INICIANDO ANÁLISIS COMPLETO DEL DOCUMENTO PARA CAMPOS DE FIRMA...');
        
        const allFields = [];
        
        // 1. BUSCAR LÍNEAS DE FIRMA EN TODO EL DOCUMENTO
        console.log('📏 Buscando líneas de firma...');
        const signatureLines = await this.findSignatureLinesComplete(ctx, width, height);
        allFields.push(...signatureLines);
        
        // 2. BUSCAR TEXTOS QUE INDIQUEN CAMPOS DE FIRMA
        console.log('🔤 Buscando indicadores de texto...');
        const textFields = await this.findTextIndicators(ctx, width, height);
        allFields.push(...textFields);
        
        // 3. BUSCAR CUADROS/TABLAS DE FIRMA
        console.log('📋 Buscando cuadros y tablas...');
        const boxFields = await this.findSignatureBoxes(ctx, width, height);
        allFields.push(...boxFields);
        
        // 4. BUSCAR ESPACIOS VACÍOS ESTRUCTURALES
        console.log('🏗️ Buscando espacios estructurales...');
        const structuralFields = await this.findStructuralFields(ctx, width, height);
        allFields.push(...structuralFields);
        
        // 5. ORDENAR CAMPOS POR RELEVANCIA
        const sortedFields = this.sortFieldsByRelevance(allFields, width, height);
        
        console.log(`✅ ${sortedFields.length} campos de firma detectados`);
        
        return sortedFields;
    }
    
    // ===========================================
    // MÉTODO 1: BUSCAR LÍNEAS DE FIRMA COMPLETAS
    // ===========================================
    static async findSignatureLinesComplete(ctx, width, height) {
        const lines = [];
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;
        
        // Escanear todo el documento con pasos más pequeños
        for (let y = 0; y < height; y += 3) {
            let consecutiveDark = 0;
            let lineStartX = 0;
            
            for (let x = 0; x < width; x++) {
                const pixelIndex = (y * width + x) * 4;
                const r = data[pixelIndex];
                const g = data[pixelIndex + 1];
                const b = data[pixelIndex + 2];
                const brightness = (r + g + b) / 3;
                
                if (brightness < 100) { // Pixel oscuro
                    if (consecutiveDark === 0) {
                        lineStartX = x;
                    }
                    consecutiveDark++;
                } else {
                    // Si encontramos una línea de longitud adecuada
                    if (consecutiveDark >= 80 && consecutiveDark <= 400) {
                        // Verificar que sea una línea horizontal (no texto)
                        const isHorizontalLine = this.verifyHorizontalLine(ctx, lineStartX, y, consecutiveDark);
                        
                        if (isHorizontalLine) {
                            // Buscar espacio arriba para firmar
                            const spaceAbove = this.findSpaceAboveLine(ctx, lineStartX, y, consecutiveDark, 70);
                            
                            if (spaceAbove) {
                                lines.push({
                                    type: 'signature_line',
                                    x: spaceAbove.x,
                                    y: spaceAbove.y,
                                    width: 150,
                                    height: 60,
                                    confidence: 0.95,
                                    priority: 1,
                                    reason: `Línea de firma encontrada (${consecutiveDark}px)`,
                                    lineY: y,
                                    lineLength: consecutiveDark
                                });
                            }
                        }
                    }
                    consecutiveDark = 0;
                }
            }
            
            // Verificar al final de la línea
            if (consecutiveDark >= 80 && consecutiveDark <= 400) {
                const isHorizontalLine = this.verifyHorizontalLine(ctx, lineStartX, y, consecutiveDark);
                if (isHorizontalLine) {
                    const spaceAbove = this.findSpaceAboveLine(ctx, lineStartX, y, consecutiveDark, 70);
                    if (spaceAbove) {
                        lines.push({
                            type: 'signature_line',
                            x: spaceAbove.x,
                            y: spaceAbove.y,
                            width: 150,
                            height: 60,
                            confidence: 0.95,
                            priority: 1,
                            reason: `Línea de firma encontrada (${consecutiveDark}px)`,
                            lineY: y,
                            lineLength: consecutiveDark
                        });
                    }
                }
            }
        }
        
        return lines;
    }
    
    // ===========================================
    // MÉTODO 2: BUSCAR INDICADORES DE TEXTO
    // ===========================================
    static async findTextIndicators(ctx, width, height) {
        const fields = [];
        
        // Palabras clave comunes en documentos colombianos
        const keywords = [
            'firma', 'firma:', 'firmar', 'firmado',
            'nombre', 'nombre:', 'nombres',
            'apellido', 'apellidos',
            'c.c.', 'cedula', 'documento',
            'recibido', 'entregado', 'revisado',
            'aprobado', 'conforme', 'acepto'
        ];
        
        // Dividir documento en celdas para análisis
        const cellSize = 80;
        const cols = Math.ceil(width / cellSize);
        const rows = Math.ceil(height / cellSize);
        
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const x = col * cellSize;
                const y = row * cellSize;
                
                // Verificar si esta celda tiene texto denso (probablemente una etiqueta)
                const hasDenseText = this.hasDenseText(ctx, x, y, cellSize, cellSize);
                
                if (hasDenseText) {
                    // Buscar espacio debajo o al lado derecho para firma
                    const spaceRight = this.findSpaceToRight(ctx, x, y, cellSize, 200, 60);
                    const spaceBelow = this.findSpaceBelow(ctx, x, y, cellSize, 150, 60);
                    
                    if (spaceRight) {
                        fields.push({
                            type: 'text_indicator_right',
                            x: spaceRight.x,
                            y: spaceRight.y,
                            width: 150,
                            height: 60,
                            confidence: 0.85,
                            priority: 2,
                            reason: 'Espacio al lado de texto indicativo'
                        });
                    }
                    
                    if (spaceBelow) {
                        fields.push({
                            type: 'text_indicator_below',
                            x: spaceBelow.x,
                            y: spaceBelow.y,
                            width: 150,
                            height: 60,
                            confidence: 0.80,
                            priority: 3,
                            reason: 'Espacio debajo de texto indicativo'
                        });
                    }
                }
            }
        }
        
        return fields;
    }
    
    // ===========================================
    // MÉTODO 3: BUSCAR CUADROS DE FIRMA
    // ===========================================
    static async findSignatureBoxes(ctx, width, height) {
        const boxes = [];
        
        // Buscar en zonas comunes para formularios
        const commonAreas = [
            { x: width * 0.1, y: height * 0.8, w: 180, h: 60, name: 'bottom_left_box' },
            { x: width * 0.7, y: height * 0.8, w: 180, h: 60, name: 'bottom_right_box' },
            { x: width * 0.4, y: height * 0.5, w: 180, h: 60, name: 'middle_box' },
            { x: width * 0.1, y: height * 0.3, w: 180, h: 60, name: 'top_left_box' },
            { x: width * 0.7, y: height * 0.3, w: 180, h: 60, name: 'top_right_box' }
        ];
        
        for (const area of commonAreas) {
            // Verificar si el área está vacía y tiene bordes
            const isEmpty = this.isAreaEmpty(ctx, area.x, area.y, area.w, area.h, 0.9);
            const hasBorders = this.hasBoxBorders(ctx, area.x, area.y, area.w, area.h);
            
            if (isEmpty && hasBorders) {
                boxes.push({
                    type: 'signature_box',
                    x: area.x + 10,
                    y: area.y + 10,
                    width: area.w - 20,
                    height: area.h - 20,
                    confidence: 0.90,
                    priority: 1,
                    reason: `Cuadro de firma detectado en ${area.name}`
                });
            }
        }
        
        return boxes;
    }
    
    // ===========================================
    // MÉTODO 4: BUSCAR CAMPOS ESTRUCTURALES
    // ===========================================
    static async findStructuralFields(ctx, width, height) {
        const fields = [];
        
        // Analizar estructura del documento basado en su formato
        const aspectRatio = width / height;
        
        if (aspectRatio > 1.3) { // Documento horizontal
            // Formularios horizontales suelen tener firmas alineadas en la parte inferior
            const horizontalSpots = [
                { x: width * 0.1, y: height * 0.85, w: 200, h: 60 },
                { x: width * 0.4, y: height * 0.85, w: 200, h: 60 },
                { x: width * 0.7, y: height * 0.85, w: 200, h: 60 }
            ];
            
            for (const spot of horizontalSpots) {
                if (this.isAreaEmpty(ctx, spot.x, spot.y, spot.w, spot.h, 0.85)) {
                    fields.push({
                        type: 'structural_horizontal',
                        x: spot.x + 10,
                        y: spot.y + 10,
                        width: spot.w - 20,
                        height: spot.h - 20,
                        confidence: 0.75,
                        priority: 4,
                        reason: 'Campo estructural en documento horizontal'
                    });
                }
            }
        } else { // Documento vertical
            // Formularios verticales suelen tener firmas en el lado derecho
            const verticalSpots = [
                { x: width * 0.65, y: height * 0.7, w: 180, h: 60 },
                { x: width * 0.65, y: height * 0.8, w: 180, h: 60 },
                { x: width * 0.15, y: height * 0.8, w: 180, h: 60 }
            ];
            
            for (const spot of verticalSpots) {
                if (this.isAreaEmpty(ctx, spot.x, spot.y, spot.w, spot.h, 0.85)) {
                    fields.push({
                        type: 'structural_vertical',
                        x: spot.x + 10,
                        y: spot.y + 10,
                        width: spot.w - 20,
                        height: spot.h - 20,
                        confidence: 0.75,
                        priority: 4,
                        reason: 'Campo estructural en documento vertical'
                    });
                }
            }
        }
        
        return fields;
    }
    
    // ===========================================
    // MÉTODOS AUXILIARES
    // ===========================================
    static verifyHorizontalLine(ctx, startX, y, length) {
        // Verificar que sea una línea continua (no texto discontinuo)
        const samplePoints = Math.min(10, Math.floor(length / 10));
        let solidCount = 0;
        
        for (let i = 0; i < samplePoints; i++) {
            const x = startX + Math.floor((i / samplePoints) * length);
            
            // Verificar varios píxeles arriba y abajo
            let columnHasLine = false;
            for (let dy = -3; dy <= 3; dy++) {
                try {
                    const pixel = ctx.getImageData(x, y + dy, 1, 1).data;
                    const brightness = (pixel[0] + pixel[1] + pixel[2]) / 3;
                    
                    if (brightness < 100) {
                        columnHasLine = true;
                        break;
                    }
                } catch (e) {
                    // Ignorar errores de límites
                }
            }
            
            if (columnHasLine) solidCount++;
        }
        
        return solidCount >= samplePoints * 0.7;
    }
    
    static findSpaceAboveLine(ctx, lineX, lineY, lineLength, maxHeight) {
        const searchHeight = Math.min(maxHeight, lineY);
        
        for (let y = lineY - 1; y >= lineY - searchHeight; y--) {
            let hasContent = false;
            
            // Verificar si esta línea tiene contenido
            for (let x = lineX; x < lineX + lineLength; x += 5) {
                try {
                    const pixel = ctx.getImageData(x, y, 1, 1).data;
                    const brightness = (pixel[0] + pixel[1] + pixel[2]) / 3;
                    
                    if (brightness < 200) {
                        hasContent = true;
                        break;
                    }
                } catch (e) {
                    // Ignorar errores
                }
            }
            
            if (hasContent) {
                // Encontramos contenido, usar espacio justo encima
                const spaceY = y + 8;
                return {
                    x: lineX + (lineLength / 2) - 75,
                    y: Math.max(10, spaceY)
                };
            }
        }
        
        // Si no encontramos contenido, usar espacio cerca de la línea
        return {
            x: lineX + (lineLength / 2) - 75,
            y: Math.max(10, lineY - 30)
        };
    }
    
    static hasDenseText(ctx, x, y, width, height) {
        let darkPixels = 0;
        let totalPixels = 0;
        
        for (let dy = 0; dy < height; dy += 2) {
            for (let dx = 0; dx < width; dx += 2) {
                try {
                    const pixel = ctx.getImageData(x + dx, y + dy, 1, 1).data;
                    const brightness = (pixel[0] + pixel[1] + pixel[2]) / 3;
                    
                    if (brightness < 150) {
                        darkPixels++;
                    }
                    totalPixels++;
                } catch (e) {
                    // Ignorar errores
                }
            }
        }
        
        return totalPixels > 20 && (darkPixels / totalPixels) > 0.3;
    }
    
    static findSpaceToRight(ctx, textX, textY, textWidth, maxWidth, maxHeight) {
        const startX = textX + textWidth + 20;
        const endX = Math.min(startX + maxWidth, ctx.canvas.width);
        
        for (let x = startX; x < endX - 150; x += 10) {
            for (let y = textY; y < textY + 50; y += 10) {
                if (this.isAreaEmpty(ctx, x, y, 150, 60, 0.9)) {
                    return { x: x + 5, y: y + 5 };
                }
            }
        }
        
        return null;
    }
    
    static findSpaceBelow(ctx, textX, textY, textWidth, maxWidth, maxHeight) {
        const startY = textY + 50;
        const endY = Math.min(startY + maxHeight, ctx.canvas.height);
        
        for (let y = startY; y < endY - 60; y += 10) {
            for (let x = textX; x < textX + textWidth; x += 10) {
                if (this.isAreaEmpty(ctx, x, y, 150, 60, 0.9)) {
                    return { x: x + 5, y: y + 5 };
                }
            }
        }
        
        return null;
    }
    
    static hasBoxBorders(ctx, x, y, width, height) {
        // Verificar bordes superior e inferior
        let topBorder = 0, bottomBorder = 0, leftBorder = 0, rightBorder = 0;
        const samplePoints = 10;
        
        // Borde superior
        for (let i = 0; i < samplePoints; i++) {
            const sampleX = x + (i / samplePoints) * width;
            const pixel = ctx.getImageData(sampleX, y, 1, 1).data;
            const brightness = (pixel[0] + pixel[1] + pixel[2]) / 3;
            if (brightness < 150) topBorder++;
        }
        
        // Borde inferior
        for (let i = 0; i < samplePoints; i++) {
            const sampleX = x + (i / samplePoints) * width;
            const pixel = ctx.getImageData(sampleX, y + height, 1, 1).data;
            const brightness = (pixel[0] + pixel[1] + pixel[2]) / 3;
            if (brightness < 150) bottomBorder++;
        }
        
        // Borde izquierdo
        for (let i = 0; i < samplePoints; i++) {
            const sampleY = y + (i / samplePoints) * height;
            const pixel = ctx.getImageData(x, sampleY, 1, 1).data;
            const brightness = (pixel[0] + pixel[1] + pixel[2]) / 3;
            if (brightness < 150) leftBorder++;
        }
        
        // Borde derecho
        for (let i = 0; i < samplePoints; i++) {
            const sampleY = y + (i / samplePoints) * height;
            const pixel = ctx.getImageData(x + width, sampleY, 1, 1).data;
            const brightness = (pixel[0] + pixel[1] + pixel[2]) / 3;
            if (brightness < 150) rightBorder++;
        }
        
        // Necesitamos al menos 2 bordes para considerar que es un cuadro
        const borderCount = [topBorder, bottomBorder, leftBorder, rightBorder]
            .filter(count => count > 5).length;
        
        return borderCount >= 2;
    }
    
    static isAreaEmpty(ctx, x, y, width, height, threshold = 0.85) {
        try {
            if (x < 0 || y < 0 || x + width > ctx.canvas.width || y + height > ctx.canvas.height) {
                return false;
            }
            
            let whitePixels = 0;
            let totalPixels = 0;
            const sampleStep = 3;
            
            for (let sy = y; sy < y + height; sy += sampleStep) {
                for (let sx = x; sx < x + width; sx += sampleStep) {
                    const pixel = ctx.getImageData(sx, sy, 1, 1).data;
                    const brightness = (pixel[0] + pixel[1] + pixel[2]) / 3;
                    
                    if (brightness > 220) {
                        whitePixels++;
                    }
                    totalPixels++;
                }
            }
            
            return totalPixels > 0 && (whitePixels / totalPixels) >= threshold;
            
        } catch (error) {
            return false;
        }
    }
    
    // ===========================================
    // ORDENAR CAMPOS POR RELEVANCIA
    // ===========================================
    static sortFieldsByRelevance(fields, width, height) {
        return fields.sort((a, b) => {
            // Primero por prioridad (menor número = mayor prioridad)
            if (a.priority !== b.priority) {
                return a.priority - b.priority;
            }
            
            // Luego por confianza
            if (b.confidence !== a.confidence) {
                return b.confidence - a.confidence;
            }
            
            // Preferir campos en la parte inferior (más comunes para firmas)
            const aDistanceFromBottom = height - (a.y + a.height);
            const bDistanceFromBottom = height - (b.y + b.height);
            
            return aDistanceFromBottom - bDistanceFromBottom;
        });
    }
    
    // ===========================================
    // FILTRAR CAMPOS OCUPADOS Y BUSCAR ALTERNATIVAS
    // ===========================================
    static findAvailableSignatureField(canvas, existingSignatures) {
        return new Promise(async (resolve) => {
            try {
                // Detectar todos los campos posibles
                const allFields = await this.detectAllSignatureFields(canvas);
                
                if (allFields.length === 0) {
                    // Si no hay campos detectados, usar posición por defecto
                    const defaultPos = this.getDefaultPosition(canvas.width, canvas.height);
                    resolve({
                        ...defaultPos,
                        fieldType: 'default_fallback',
                        confidence: 0.1,
                        reason: 'No se detectaron campos de firma'
                    });
                    return;
                }
                
                // Filtrar campos que no estén ocupados por firas existentes
                const availableFields = this.filterOccupiedFields(allFields, existingSignatures);
                
                // Si hay campos disponibles, usar el mejor
                if (availableFields.length > 0) {
                    const bestField = availableFields[0];
                    console.log(`✅ Campo de firma disponible encontrado: ${bestField.type} (${bestField.confidence} confianza)`);
                    resolve(bestField);
                    return;
                }
                
                // Si todos los campos están ocupados, buscar espacio cerca de campos existentes
                console.log('⚠️ Todos los campos están ocupados, buscando espacio cercano...');
                const nearField = this.findSpaceNearOccupiedField(canvas, allFields[0], existingSignatures);
                
                if (nearField) {
                    resolve(nearField);
                    return;
                }
                
                // Último recurso: posición por defecto
                const defaultPos = this.getDefaultPosition(canvas.width, canvas.height);
                resolve({
                    ...defaultPos,
                    fieldType: 'all_occupied_fallback',
                    confidence: 0.05,
                    reason: 'Todos los campos ocupados, sin espacio cercano disponible'
                });
                
            } catch (error) {
                console.error('Error en findAvailableSignatureField:', error);
                const defaultPos = this.getDefaultPosition(canvas.width, canvas.height);
                resolve({
                    ...defaultPos,
                    fieldType: 'error_fallback',
                    confidence: 0.01,
                    reason: 'Error en detección: ' + error.message
                });
            }
        });
    }
    
    static filterOccupiedFields(fields, existingSignatures) {
        if (!existingSignatures || existingSignatures.length === 0) {
            return fields;
        }
        
        return fields.filter(field => {
            for (const sig of existingSignatures) {
                const sigX = sig.x;
                const sigY = sig.y;
                const sigWidth = sig.width || 150;
                const sigHeight = sig.height || 60;
                
                // Verificar superposición
                const overlap = !(
                    field.x + field.width < sigX ||
                    field.x > sigX + sigWidth ||
                    field.y + field.height < sigY ||
                    field.y > sigY + sigHeight
                );
                
                if (overlap) {
                    return false; // Campo ocupado
                }
            }
            return true; // Campo disponible
        });
    }
    
    static findSpaceNearOccupiedField(canvas, referenceField, existingSignatures) {
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        
        // Intentar posiciones alrededor del campo de referencia
        const searchPositions = [
            // Derecha
            { x: referenceField.x + referenceField.width + 20, y: referenceField.y },
            // Abajo
            { x: referenceField.x, y: referenceField.y + referenceField.height + 20 },
            // Izquierda (si hay espacio)
            { x: referenceField.x - referenceField.width - 20, y: referenceField.y },
            // Arriba (si hay espacio)
            { x: referenceField.x, y: referenceField.y - referenceField.height - 20 },
            // Diagonal inferior derecha
            { x: referenceField.x + referenceField.width + 20, y: referenceField.y + referenceField.height + 20 }
        ];
        
        for (const pos of searchPositions) {
            // Verificar que esté dentro del canvas
            if (pos.x >= 0 && pos.y >= 0 && 
                pos.x + referenceField.width <= width && 
                pos.y + referenceField.height <= height) {
                
                // Verificar que el área esté vacía
                if (this.isAreaEmpty(ctx, pos.x, pos.y, referenceField.width, referenceField.height, 0.8)) {
                    
                    // Verificar que no esté ocupado por otras firmas
                    let isOccupied = false;
                    for (const sig of existingSignatures) {
                        const sigX = sig.x;
                        const sigY = sig.y;
                        const sigWidth = sig.width || 150;
                        const sigHeight = sig.height || 60;
                        
                        const overlap = !(
                            pos.x + referenceField.width < sigX ||
                            pos.x > sigX + sigWidth ||
                            pos.y + referenceField.height < sigY ||
                            pos.y > sigY + sigHeight
                        );
                        
                        if (overlap) {
                            isOccupied = true;
                            break;
                        }
                    }
                    
                    if (!isOccupied) {
                        console.log(`✅ Espacio cercano encontrado en (${pos.x}, ${pos.y})`);
                        return {
                            ...referenceField,
                            x: pos.x,
                            y: pos.y,
                            fieldType: `near_${referenceField.type}`,
                            confidence: referenceField.confidence * 0.7,
                            reason: `Espacio cerca de campo ${referenceField.type} ocupado`
                        };
                    }
                }
            }
        }
        
        return null;
    }
    
    static getDefaultPosition(width, height) {
        // Posición por defecto basada en el tipo de documento
        const aspectRatio = width / height;
        
        if (aspectRatio > 1.3) {
            // Horizontal
            return {
                x: width * 0.75 - 75,
                y: height * 0.85 - 30,
                width: 90,
                height: 36
            };
        } else {
            // Vertical
            return {
                x: width * 0.65 - 75,
                y: height * 0.88 - 30,
                width: 90,
                height: 36
            };
        }
    }
}

DocumentService.saveDocumentWithSignatures = async function() {
    if (!this.currentDocument) {
        showNotification('No hay documento seleccionado', 'error');
        return;
    }
    
    if (this.documentSignatures.length === 0) {
        showNotification('No hay firmas en el documento para guardar', 'warning');
        return;
    }
    
    showNotification('Guardando documento firmado en la nube...');
    
    try {
        console.log('saveDocumentWithSignatures: documentSignatures count =', this.documentSignatures.length, this.documentSignatures);
        const signatureLayer = document.getElementById('signatureLayer');
        console.log('saveDocumentWithSignatures: signatureLayer children =', signatureLayer ? signatureLayer.children.length : 'no layer');
        const result = await DocumentExportService.combineSignaturesWithDocument();
        
        // AGREGAR firmante actual a las firmas si no está
        const currentUserSignature = {
            userName: AppState.currentUser.name,
            userEmail: AppState.currentUser.email,
            timestamp: new Date(),
            type: AppState.currentSignature?.type || 'auto'
        };
        
        // Verificar si el usuario actual ya firmó
        const alreadySigned = this.documentSignatures.some(sig => 
            sig.userEmail === AppState.currentUser.email
        );
        
        if (!alreadySigned) {
            this.documentSignatures.push(currentUserSignature);
        }
        
        // Crear nombre para el archivo firmado
        const originalName = this.currentDocument.name;
        const extensionIndex = originalName.lastIndexOf('.');
        let signedFileName;
        
        if (extensionIndex !== -1) {
            const nameWithoutExt = originalName.substring(0, extensionIndex);
            const extension = originalName.substring(extensionIndex);
            signedFileName = `${nameWithoutExt} (Firmado)${extension}`;
        } else {
            signedFileName = `${originalName} (Firmado)`;
        }
        
        // Subir directamente a Supabase usando FileService.addSignedDocument
        const signedFileData = await FileService.addSignedDocument(
            this.currentDocument.id,
            result.blob,
            signedFileName,
            this.documentSignatures
        );

        // Actualizar documento actual en memoria con el nuevo archivo firmado
        this.currentDocument = signedFileData;

        // Marcar todas las firmas como "bakedIn" (integradas en la nueva imagen)
        if (signedFileData.signatures && signedFileData.signatures.length > 0) {
            this.documentSignatures = signedFileData.signatures.map(s => ({ ...s, bakedIn: true }));
        } else {
            this.documentSignatures = [];
        }

        // Re-renderizar lista; no renderizar overlays para firmas bakedIn
        this.renderExistingSignatures();
        this.renderSignaturesList();

        showNotification(`Documento firmado guardado exitosamente en Supabase: ${signedFileName}`);

        return signedFileData;
        
    } catch (error) {
        console.error('Error al guardar documento con firmas:', error);
        showNotification('Error al guardar el documento: ' + error.message, 'error');
    }
};


class PreviewService {
    static async showPreview(blob, type, fileName) {
        const modal = document.getElementById('previewModal');
        const content = document.getElementById('previewContent');
        const downloadBtn = document.getElementById('downloadPreviewBtn');
        const closeBtn = document.getElementById('closePreviewBtn');
        const closeModalBtn = document.getElementById('closePreviewModal');
        
        if (!modal || !content) return;
        
        content.innerHTML = '';
        
        if (type === 'application/pdf') {
            content.innerHTML = `<embed class="preview-pdf" src="${URL.createObjectURL(blob)}" type="application/pdf" />`;
        } else {
            content.innerHTML = `<img class="preview-image" src="${URL.createObjectURL(blob)}" alt="Previsualización" style="max-width: 100%; height: auto;" />`;
        }
        
        downloadBtn.onclick = () => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        };
        
        const closeModal = () => {
            modal.classList.remove('show');
            const embed = content.querySelector('embed');
            const img = content.querySelector('img');
            if (embed && embed.src) URL.revokeObjectURL(embed.src);
            if (img && img.src) URL.revokeObjectURL(img.src);
        };
        
        closeBtn.onclick = closeModal;
        closeModalBtn.onclick = closeModal;
        modal.onclick = (e) => {
            if (e.target === modal) closeModal();
        };
        
        modal.classList.add('show');
    }
}

DocumentService.previewCombinedDocument = async function() {
    if (!this.currentDocument) {
        showNotification('No hay documento seleccionado', 'error');
        return;
    }
    
    if (this.documentSignatures.length === 0) {
        showNotification('No hay firmas en el documento para previsualizar', 'warning');
        return;
    }
    
    showNotification('Generando previsualización en alta calidad...');
    
    try {
        const result = await DocumentExportService.combineSignaturesWithDocument();
        await PreviewService.showPreview(result.blob, result.type, result.fileName);
        
    } catch (error) {
        console.error('Error al previsualizar documento:', error);
        showNotification('Error al generar previsualización: ' + error.message, 'error');
    }
};

// Sistema de Actividades
class ActivityService {
    static async loadRecentActivities() {
        try {
            const storage = new CloudStorageService();
            const activities = await storage.getRecentActivities(5);
            this.renderActivities(activities);
        } catch (error) {
            console.error('Error loading activities:', error);
        }
    }
    
    static renderActivities(activities) {
        const activityFeed = document.querySelector('.activity-feed');
        if (!activityFeed) return;
        
        const activityItems = activityFeed.querySelectorAll('.activity-item');
        activityItems.forEach(item => item.remove());
        
        const limitedActivities = activities.slice(0, 5);
        
        limitedActivities.forEach(activity => {
            const activityItem = document.createElement('div');
            activityItem.className = 'activity-item';
            
            const icon = this.getActivityIcon(activity.type);
            const time = new Date(activity.timestamp?.toDate?.() || activity.timestamp).toLocaleTimeString('es-ES', {
                hour: '2-digit',
                minute: '2-digit'
            });
            
            activityItem.innerHTML = `
                <div class="activity-icon">
                    <i class="${icon}"></i>
                </div>
                <div class="activity-content">
                    <div>${activity.description}</div>
                    <div class="activity-time">${time}</div>
                </div>
            `;
            
            activityFeed.appendChild(activityItem);
        });
    }
    
    static getActivityIcon(activityType) {
        const icons = {
            'file_upload': 'fas fa-upload',
            'file_delete': 'fas fa-trash',
            'document_signed': 'fas fa-signature',
            'user_login': 'fas fa-sign-in-alt',
            'user_register': 'fas fa-user-plus'
        };
        return icons[activityType] || 'fas fa-info-circle';
    }
}

// Sistema de Colaboración
class CollaborationService {
    static collaborators = [];

    static async updateOnlineUsers() {
        const usersList = document.getElementById('usersList');
        if (!usersList) return;
        
        usersList.innerHTML = '';
        
        try {
            const storage = new CloudStorageService();
            const allUsers = await storage.getAllUsers();
            
            Object.values(allUsers).forEach(user => {
                const userItem = document.createElement('li');
                userItem.className = 'user-item';
                userItem.innerHTML = `
                    <div class="user-status ${user.email === AppState.currentUser?.email ? 'online' : 'away'}"></div>
                    <div>${user.name} 
                        <span class="permission-badge permission-${user.role}">
                            ${user.role === 'owner' ? 'Propietario' : 'Usuario'}
                        </span>
                    </div>
                `;
                usersList.appendChild(userItem);
            });
            
            if (usersList.children.length === 0) {
                const emptyMessage = document.createElement('li');
                emptyMessage.className = 'user-item';
                emptyMessage.innerHTML = `
                    <div style="color: rgba(255,255,255,0.7); font-size: 14px;">
                        Solo tú estás conectado
                    </div>
                `;
                usersList.appendChild(emptyMessage);
            }
        } catch (error) {
            console.error('Error loading online users:', error);
        }
    }

    static async renderCollaborators() {
        const collaboratorsList = document.getElementById('collaboratorsList');
        const collaboratorsCount = document.getElementById('collaboratorsCount');
        
        if (!collaboratorsList || !collaboratorsCount) return;
        
        try {
            const storage = new CloudStorageService();
            const allUsers = await storage.getAllUsers();
            const collaborators = Object.values(allUsers);
            
            collaboratorsCount.textContent = `${collaborators.length} miembro${collaborators.length !== 1 ? 's' : ''}`;
            collaboratorsList.innerHTML = '';
            
            collaborators.forEach(user => {
                const collaboratorItem = document.createElement('div');
                collaboratorItem.className = 'collaborator-item';
                
                // QUITAR LA ETIQUETA DE PROPIETARIO Y EL BOTÓN DE REMOVER
                collaboratorItem.innerHTML = `
                    <div class="collaborator-avatar">${user.avatar}</div>
                    <div class="collaborator-details">
                        <div class="collaborator-name">${user.name}</div>
                        <div class="collaborator-email">${user.email}</div>
                    </div>
                `;
                
                collaboratorsList.appendChild(collaboratorItem);
            });
            
        } catch (error) {
            console.error('Error loading collaborators:', error);
        }
    }
    
    static async removeCollaborator(email) {
        if (email === AppState.currentUser?.email) {
            showNotification('No puedes removerte a ti mismo', 'error');
            return;
        }
        
        if (confirm(`¿Estás seguro de que quieres remover a este colaborador?`)) {
            try {
                showNotification('Funcionalidad de remover colaboradores en desarrollo', 'warning');
            } catch (error) {
                console.error('Error removing collaborator:', error);
                showNotification('Error al remover colaborador', 'error');
            }
        }
    }
}

// Utilidades
function showNotification(message, type = 'success') {
    const notification = document.getElementById('notification');
    const notificationText = document.getElementById('notificationText');
    
    if (!notification || !notificationText) return;
    
    notificationText.textContent = message;
    notification.className = 'notification';
    notification.classList.add(type, 'show');
    
    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
}

function updateTimestamp() {
    const now = new Date();
    const updateTime = document.getElementById('updateTime');
    if (updateTime) {
        updateTime.textContent = `Hoy, ${now.toLocaleTimeString('es-ES', {hour: '2-digit', minute: '2-digit'})}`;
    }
}

function switchPage(pageId) {
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
    });
    
    const pageElement = document.getElementById(`${pageId}-page`);
    if (pageElement) pageElement.classList.add('active');
    
    document.querySelectorAll('.nav-link').forEach(navLink => {
        navLink.classList.remove('active');
        if (navLink.dataset.page === pageId) {
            navLink.classList.add('active');
        }
    });
    
    if (pageId === 'files') {
        FileService.renderFilesGrid();
    } else if (pageId === 'collaborators') {
        CollaborationService.renderCollaborators();
    } else if (pageId === 'documents') {
        ActivityService.loadRecentActivities();
    } else if (pageId === 'settings') {
        DocumentService.loadUserSettings();
    }
}

function syncFileSystem() {
    DocumentService.renderDocumentSelector();
    
    if (document.getElementById('files-page') && 
        document.getElementById('files-page').classList.contains('active')) {
        FileService.renderFilesGrid();
    }
}

function updateAutoSignaturePreview() {
    const autoPreview = document.getElementById('autoSignaturePreview');
    if (!autoPreview || !AppState.currentSignature || AppState.currentSignature.type !== 'auto') return;
    
    autoPreview.innerHTML = `
        <img src="${AppState.currentSignature.data}" alt="Firma automática" 
             style="max-width: 100%; max-height: 110px; background: transparent; border: 1px solid #e1e5e9; border-radius: 4px;">
    `;
}

// Inicialización de la aplicación
document.addEventListener('DOMContentLoaded', function() {
    try { AuthService.initAuthListener(); } catch (e) {}

    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const email = document.getElementById('email');
            const password = document.getElementById('password');
            
            if (!window.firebase || !firebase.auth) {
                showNotification('Servicio de autenticación no disponible', 'error');
                return;
            }
            if (!email || !password || !email.value || !password.value) {
                showNotification('Por favor, completa todos los campos', 'error');
                return;
            }
            
            try {
                const result = await AuthService.loginUser(email.value, password.value);
                
                if (result.success) {
                    showNotification(`¡Bienvenido a Cente Docs, ${result.user.name}!`);
                } else {
                    showNotification(result.error, 'error');
                }
            } catch (error) {
                showNotification('Error en el inicio de sesión', 'error');
            }
        });
    }
    const togglePassword = document.getElementById('togglePassword');
    if (togglePassword) {
        togglePassword.addEventListener('click', function() {
            const input = document.getElementById('password');
            if (!input) return;
            const isText = input.type === 'text';
            input.type = isText ? 'password' : 'text';
            const icon = this.querySelector('i');
            if (icon) icon.className = isText ? 'fas fa-eye' : 'fas fa-eye-slash';
        });
    }
    
    const registerBtn = document.getElementById('registerBtn');
    if (registerBtn) {
        registerBtn.addEventListener('click', async function() {
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            
            if (!window.firebase || !firebase.auth) {
                showNotification('Servicio de autenticación no disponible', 'error');
                return;
            }
            if (!email || !password) {
                showNotification('Por favor, completa todos los campos', 'error');
                return;
            }
            
            const name = prompt('Por favor, ingresa tu nombre completo:');
            if (!name) {
                showNotification('El nombre es requerido', 'error');
                return;
            }
            
            try {
                const result = await AuthService.registerUser(email, password, name);
                
                if (result.success) {
                    showNotification(`¡Cuenta creada exitosamente! Bienvenido ${name}`);
                    document.getElementById('email').value = '';
                    document.getElementById('password').value = '';
                } else {
                    showNotification(result.error, 'error');
                }
            } catch (error) {
                showNotification('Error en el registro', 'error');
            }
        });
    }
    
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function() {
            AuthService.logout();
        });
    }
    
    document.querySelectorAll('.signature-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            const tabId = this.dataset.tab;
            
            document.querySelectorAll('.signature-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.signature-tab-content').forEach(c => c.classList.remove('active'));
            
            this.classList.add('active');
            const content = document.getElementById(`${tabId}-tab`);
            if (content) content.classList.add('active');
        });
    });
    
    // ===========================================
    // MODIFICAR: Evento para useAutoSignatureBtn
    // ===========================================
    const useAutoSignatureBtn = document.getElementById('useAutoSignature');
    if (useAutoSignatureBtn) {
        useAutoSignatureBtn.addEventListener('click', function() {
            if (AppState.currentSignature && AppState.currentSignature.type === 'auto') {
                DocumentService.setCurrentSignature(AppState.currentSignature);
                showNotification('Firma automática seleccionada');
            } else {
                showNotification('No hay firma automática disponible', 'error');
            }
        });
    }
    
    const refreshAutoSignatureBtn = document.getElementById('refreshAutoSignature');
    if (refreshAutoSignatureBtn) {
        refreshAutoSignatureBtn.addEventListener('click', async function() {
            if (!AppState.currentUser) {
                showNotification('No hay usuario logueado', 'error');
                return;
            }
            
            try {
                const autoSignature = await SignatureGenerator.createUserSignature(AppState.currentUser);
                AppState.currentSignature = autoSignature;
                
                const signaturePreview = document.getElementById('signaturePreview');
                if (signaturePreview) {
                    signaturePreview.src = autoSignature.data;
                }
                
                updateAutoSignaturePreview();
                
                showNotification('Firma automática actualizada');
            } catch (error) {
                console.error('Error al actualizar firma automática:', error);
                showNotification('Error al actualizar firma automática', 'error');
            }
        });
    }
    
    const signatureFileInput = document.getElementById('signatureFileInput');
    const uploadSignatureArea = document.getElementById('uploadSignatureArea');
    const saveUploadSignatureBtn = document.getElementById('saveUploadSignature');
    const clearUploadSignatureBtn = document.getElementById('clearUploadSignature');
    
    if (uploadSignatureArea) {
        uploadSignatureArea.addEventListener('click', function() {
            if (signatureFileInput) signatureFileInput.click();
        });
    }
    
    if (signatureFileInput) {
        signatureFileInput.addEventListener('change', function() {
            if (this.files.length > 0) {
                const file = this.files[0];
                const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml'];
                
                if (!validTypes.includes(file.type)) {
                    showNotification('Por favor, selecciona un archivo válido (PNG, JPG, SVG)', 'error');
                    return;
                }
                
                const reader = new FileReader();
                reader.onload = function(e) {
                    const signatureData = e.target.result;
                    
                    const signaturePreview = document.getElementById('signaturePreview');
                    const noSignature = document.getElementById('noSignature');
                    const signatureInfo = document.getElementById('signatureInfo');
                    
                    if (signaturePreview) {
                        signaturePreview.src = signatureData;
                        signaturePreview.style.display = 'block';
                    }
                    if (noSignature) noSignature.style.display = 'none';
                    if (signatureInfo) {
                        signatureInfo.textContent = `Archivo: ${file.name}`;
                        signatureInfo.style.display = 'block';
                    }
                    
                    AppState.currentSignature = {
                        data: signatureData,
                        type: 'upload',
                        fileName: file.name
                    };
                };
                
                reader.readAsDataURL(file);
            }
        });
    }
    
    // ===========================================
    // MODIFICAR: Evento para saveUploadSignatureBtn
    // ===========================================
    if (saveUploadSignatureBtn) {
        saveUploadSignatureBtn.addEventListener('click', function() {
            if (!AppState.currentSignature) {
                showNotification('Por favor, carga una firma digital primero', 'error');
                return;
            }
            
            DocumentService.setCurrentSignature(AppState.currentSignature);
            showNotification('Firma guardada correctamente');
        });
    }
    
    if (clearUploadSignatureBtn) {
        clearUploadSignatureBtn.addEventListener('click', function() {
            const signaturePreview = document.getElementById('signaturePreview');
            const noSignature = document.getElementById('noSignature');
            const signatureInfo = document.getElementById('signatureInfo');
            
            if (signaturePreview) signaturePreview.style.display = 'none';
            if (noSignature) noSignature.style.display = 'block';
            if (signatureInfo) signatureInfo.style.display = 'none';
            if (signatureFileInput) signatureFileInput.value = '';
            
            AppState.currentSignature = null;
            showNotification('Firma eliminada', 'warning');
        });
    }
    
    const documentSelector = document.getElementById('documentSelector');
    if (documentSelector) {
        documentSelector.addEventListener('change', function() {
            if (this.value) {
                const file = FileService.files.find(f => f.id === this.value);
                if (file) {
                    DocumentService.loadDocument(file);
                } else {
                    const noDocument = document.getElementById('noDocument');
                    const documentContainer = document.getElementById('documentContainer');
                    
                    if (noDocument) noDocument.style.display = 'block';
                    if (documentContainer) documentContainer.style.display = 'none';
                }
            } else {
                const noDocument = document.getElementById('noDocument');
                const documentContainer = document.getElementById('documentContainer');
                
                if (noDocument) noDocument.style.display = 'block';
                if (documentContainer) documentContainer.style.display = 'none';
            }
        });
    }
    
    // Para el botón de subir documento en la página de documentos
    const uploadDocumentBtn = document.getElementById('uploadDocumentBtn');
    const documentFileInput = document.createElement('input');
    documentFileInput.type = 'file';
    documentFileInput.style.display = 'none';
    documentFileInput.accept = '.pdf,.jpg,.jpeg,.png,.doc,.docx,.txt,.xls,.xlsx,.ppt,.pptx,.zip,.rar';
    documentFileInput.multiple = false; // Para documentos, solo uno a la vez
    document.body.appendChild(documentFileInput);

    if (uploadDocumentBtn) {
        uploadDocumentBtn.addEventListener('click', function() {
            documentFileInput.click();
        });
    }

    documentFileInput.addEventListener('change', async function() {
        if (this.files.length > 0) {
            try {
                showNotification(`Subiendo documento...`);
                
                const uploadedFiles = await FileService.uploadFiles(this.files);
                
                if (uploadedFiles.length > 0) {
                    // Cargar el primer documento automáticamente
                    await DocumentService.loadDocument(uploadedFiles[0]);
                    showNotification(`Documento subido y cargado correctamente`);
                }
                
                // Actualizar el selector de documentos
                DocumentService.renderDocumentSelector();
                
                // Actualizar la página de archivos si está visible
                if (document.getElementById('files-page') && 
                    document.getElementById('files-page').classList.contains('active')) {
                    await FileService.renderFilesGrid();
                }
                
                this.value = '';
                
            } catch (error) {
                console.error('Error al subir documento:', error);
                showNotification('Error al subir documento: ' + error.message, 'error');
            }
        }
    });
    
    // ===========================================
    // MODIFICAR: Evento para addSignatureBtn
    // ===========================================
    const addSignatureBtn = document.getElementById('addSignatureBtn');
    if (addSignatureBtn) {
        addSignatureBtn.addEventListener('click', function() {
            if (!DocumentService.currentDocument) {
                showNotification('Primero selecciona un documento', 'error');
                return;
            }
            
            if (!AppState.currentSignature) {
                showNotification('Primero guarda una firma en el panel lateral', 'error');
                return;
            }
            
            // Agregar firma automáticamente usando la firma actual
            DocumentService.setCurrentSignature(AppState.currentSignature);
        });
    }
    
    const zoomInBtn = document.getElementById('zoomInBtn');
    const zoomOutBtn = document.getElementById('zoomOutBtn');
    
    if (zoomInBtn) {
        zoomInBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            DocumentService.zoomIn();
        });
    }
    
    if (zoomOutBtn) {
        zoomOutBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            DocumentService.zoomOut();
        });
    }
    
    const viewerContent = document.getElementById('viewerContent');
    if (viewerContent) {
        viewerContent.addEventListener('wheel', function(e) {
            if (e.ctrlKey) {
                e.preventDefault();
                if (e.deltaY < 0) {
                    DocumentService.zoomIn();
                } else {
                    DocumentService.zoomOut();
                }
            }
        }, { passive: false });
    }
    
    // ===========================================
    // NUEVO: Zoom táctil (pinch to zoom)
    // ===========================================
    if (viewerContent) {
        let initialDistance = null;
        let lastZoomTime = 0;
        
        viewerContent.addEventListener('touchstart', (e) => {
            if (e.touches.length === 2) {
                initialDistance = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
                e.preventDefault();
            }
        }, { passive: false });
        
        viewerContent.addEventListener('touchmove', (e) => {
            if (e.touches.length === 2 && initialDistance) {
                const currentTime = Date.now();
                // Limitar la frecuencia de zoom para evitar sobrecarga
                if (currentTime - lastZoomTime < 100) return;
                
                const currentDistance = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
                
                const distanceDiff = currentDistance - initialDistance;
                
                if (Math.abs(distanceDiff) > 20) {
                    if (distanceDiff > 0) {
                        // Pellizco hacia afuera - zoom in
                        DocumentService.zoomIn();
                    } else {
                        // Pellizco hacia adentro - zoom out
                        DocumentService.zoomOut();
                    }
                    lastZoomTime = currentTime;
                    initialDistance = currentDistance;
                    e.preventDefault();
                }
            }
        }, { passive: false });
        
        viewerContent.addEventListener('touchend', () => {
            initialDistance = null;
        });
    }
    
    document.addEventListener('keydown', function(e) {
        if (e.ctrlKey) {
            if (e.key === '=' || e.key === '+') {
                e.preventDefault();
                DocumentService.zoomIn();
            } else if (e.key === '-' || e.key === '_') {
                e.preventDefault();
                DocumentService.zoomOut();
            } else if (e.key === '0') {
                e.preventDefault();
                DocumentService.currentZoom = 1.0;
                DocumentService.applyRealZoom();
            }
        }
    });
    
    const previewDocumentBtn = document.getElementById('previewDocumentBtn');
    if (previewDocumentBtn) {
        previewDocumentBtn.addEventListener('click', function() {
            DocumentService.previewCombinedDocument();
        });
    }
    
    const clearAllSignatures = document.getElementById('clearAllSignatures');
    if (clearAllSignatures) {
        clearAllSignatures.addEventListener('click', function() {
            if (DocumentService.documentSignatures.length === 0) {
                showNotification('No hay firmas para eliminar', 'warning');
                return;
            }
            
            if (confirm('¿Estás seguro de que quieres eliminar todas las firmas del documento?')) {
                DocumentService.clearAllSignatures();
            }
        });
    }
    
    const saveDocumentWithSignatures = document.getElementById('saveDocumentWithSignatures');
    if (saveDocumentWithSignatures) {
        saveDocumentWithSignatures.addEventListener('click', function() {
            if (!DocumentService.currentDocument) {
                showNotification('No hay documento seleccionado', 'error');
                return;
            }
            
            if (DocumentService.documentSignatures.length === 0) {
                showNotification('No hay firmas en el documento para guardar', 'warning');
                return;
            }
            
            DocumentService.saveDocumentWithSignatures();
        });
    }
    
    const fileInput = document.getElementById('fileInput');
    const uploadArea = document.getElementById('uploadArea');
    const uploadFileBtn = document.getElementById('uploadFileBtn');
    
    if (uploadArea && fileInput) {
        uploadArea.addEventListener('click', function() {
            fileInput.click();
        });
    }
    
    if (uploadFileBtn && fileInput) {
        uploadFileBtn.addEventListener('click', function() {
            fileInput.click();
        });
    }
    
    if (fileInput) {
        fileInput.addEventListener('change', async function() {
            if (this.files.length > 0) {
                try {
                    showNotification(`Subiendo ${this.files.length} archivo(s)...`);
                    
                    const uploadedFiles = await FileService.uploadFiles(this.files);
                    
                    FileService.renderFilePreviews(uploadedFiles);
                    const filePreviewContainer = document.getElementById('filePreviewContainer');
                    if (filePreviewContainer) filePreviewContainer.style.display = 'block';
                    
                    FileService.renderFilesGrid();
                    
                    showNotification(`${uploadedFiles.length} archivo(s) subido(s) correctamente`);
                    
                    this.value = '';
                } catch (error) {
                    console.error('Error al subir archivos:', error);
                    showNotification('Error al subir archivos', 'error');
                }
            }
        });
    }
    
    const fileSearchInput = document.getElementById('fileSearchInput');
    if (fileSearchInput) {
        fileSearchInput.addEventListener('input', function(e) {
            const searchTerm = e.target.value.toLowerCase();
            FileService.filterFiles(searchTerm);
        });
    }
    
    const addCommentBtn = document.getElementById('addCommentBtn');
    if (addCommentBtn) {
        addCommentBtn.addEventListener('click', function() {
            const commentInput = document.getElementById('commentInput');
            const comment = commentInput ? commentInput.value.trim() : '';
            
            if (comment) {
                const commentsSection = document.querySelector('.comments-section');
                if (!commentsSection) return;
                
                const newComment = document.createElement('div');
                newComment.className = 'comment';
                newComment.innerHTML = `
                    <div class="comment-header">
                        <span class="comment-user">${AppState.currentUser.name}</span>
                        <span class="comment-time">${new Date().toLocaleTimeString('es-ES', {hour: '2-digit', minute: '2-digit'})}</span>
                    </div>
                    <div>${comment}</div>
                `;
                
                const commentsContainer = commentsSection.querySelector('.comment:first-child');
                if (commentsContainer) {
                    commentsSection.insertBefore(newComment, commentsContainer.nextSibling);
                } else {
                    commentsSection.appendChild(newComment);
                }
                
                if (commentInput) commentInput.value = '';
                showNotification('Comentario agregado');
            }
        });
    }
    
    const commentInput = document.getElementById('commentInput');
    if (commentInput) {
        commentInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                const addCommentBtn = document.getElementById('addCommentBtn');
                if (addCommentBtn) addCommentBtn.click();
            }
        });
    }
    
    const addCollaboratorBtn = document.getElementById('addCollaboratorBtn');
    const closeCollaboratorModal = document.getElementById('closeCollaboratorModal');
    const cancelCollaboratorBtn = document.getElementById('cancelCollaboratorBtn');
    const confirmCollaboratorBtn = document.getElementById('confirmCollaboratorBtn');
    
    if (addCollaboratorBtn) {
        addCollaboratorBtn.addEventListener('click', function() {
            const modal = document.getElementById('addCollaboratorModal');
            if (modal) modal.classList.add('show');
        });
    }
    
    if (closeCollaboratorModal) {
        closeCollaboratorModal.addEventListener('click', function() {
            const modal = document.getElementById('addCollaboratorModal');
            if (modal) modal.classList.remove('show');
        });
    }
    
    if (cancelCollaboratorBtn) {
        cancelCollaboratorBtn.addEventListener('click', function() {
            const modal = document.getElementById('addCollaboratorModal');
            if (modal) modal.classList.remove('show');
        });
    }
    
    if (confirmCollaboratorBtn) {
        confirmCollaboratorBtn.addEventListener('click', function() {
            const emailInput = document.getElementById('collaboratorEmail');
            const roleInput = document.getElementById('collaboratorRole');
            
            const email = emailInput ? emailInput.value : '';
            const role = roleInput ? roleInput.value : 'editor';
            
            if (!email) {
                showNotification('Por favor, ingresa un correo electrónico', 'error');
                return;
            }
            
            if (!validateEmail(email)) {
                showNotification('Por favor, ingresa un correo electrónico válido', 'error');
                return;
            }
            
            showNotification(`Invitación enviada a ${email}`);
            
            const modal = document.getElementById('addCollaboratorModal');
            if (modal) modal.classList.remove('show');
            
            if (emailInput) emailInput.value = '';
            if (roleInput) roleInput.value = 'editor';
        });
    }
    
    function validateEmail(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    }
    
    window.addEventListener('click', function(e) {
        const modal = document.getElementById('addCollaboratorModal');
        if (e.target === modal) {
            modal.classList.remove('show');
        }
        
        const previewModal = document.getElementById('previewModal');
        if (e.target === previewModal) {
            previewModal.classList.remove('show');
        }
    });
    
    document.querySelectorAll('.nav-link').forEach(link => {
        if (link.id !== 'logoutBtn') {
            link.addEventListener('click', function() {
                const pageId = this.dataset.page;
                switchPage(pageId);
            });
        }
    });

    const checkAuthState = setInterval(() => {
        const currentUser = firebase.auth().currentUser;
        if (currentUser) {
            clearInterval(checkAuthState);
            console.log('Usuario ya logueado, cargando archivos...');
            
            // Cargar archivos después de 1 segundo para asegurar que todo esté listo
            setTimeout(async () => {
                try {
                    await FileService.loadUserDocuments();
                    DocumentService.renderDocumentSelector();
                    
                    // Si estamos en la página de archivos, renderizar la cuadrícula
                    if (document.getElementById('files-page') && 
                        document.getElementById('files-page').classList.contains('active')) {
                        FileService.renderFilesGrid();
                    }
                } catch (error) {
                    console.error('Error al cargar archivos:', error);
                }
            }, 1000);
        }
    }, 500); // Verificar cada 500ms
    
    // Limpiar el intervalo después de 5 segundos si no hay usuario
    setTimeout(() => {
        clearInterval(checkAuthState);
    }, 5000);
    
    updateTimestamp();
});

window.addEventListener('beforeunload', function() {
    console.log('Limpiando recursos antes de cerrar/recargar la página...');
    
    // Limpiar URLs de objetos para liberar memoria
    FileService.cleanup();
    
    // También limpiar el documento actual si existe
    if (DocumentService.currentDocument && DocumentService.currentDocument.url && 
        DocumentService.currentDocument.url.startsWith('blob:')) {
        try {
            URL.revokeObjectURL(DocumentService.currentDocument.url);
        } catch (error) {
            // Ignorar errores
        }
    }
    
    // Limpiar firmas si existen
    if (AppState.currentSignature && AppState.currentSignature.data && 
        AppState.currentSignature.data.startsWith('blob:')) {
        try {
            URL.revokeObjectURL(AppState.currentSignature.data);
        } catch (error) {
            // Ignorar errores
        }
    }
});
