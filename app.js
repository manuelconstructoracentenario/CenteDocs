// ============================================
// SERVICIO DE SUPABASE STORAGE
// ============================================

class SupabaseStorageService {
    constructor() {
        this.client = supabase;
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
        firebase.auth().onAuthStateChanged(async (user) => {
            if (user) {
                console.log('Usuario autenticado:', user.email);
                const storage = new CloudStorageService();
                const userData = await storage.getUser(user.email);
                
                if (userData) {
                    AuthService.setCurrentUser(userData);
                    
                    // Actualizar UI
                    const currentUserName = document.getElementById('currentUserName');
                    const userAvatar = document.getElementById('userAvatar');
                    
                    if (currentUserName) currentUserName.textContent = userData.name;
                    if (userAvatar) userAvatar.textContent = userData.avatar;
                    
                    try {
                        const autoSignature = await SignatureGenerator.createUserSignature(userData);
                        AppState.currentSignature = autoSignature;
                        updateAutoSignaturePreview();
                    } catch (error) {
                        console.error('Error generating signature:', error);
                    }
                    
                    // Mostrar aplicación
                    document.getElementById('loginScreen').style.display = 'none';
                    document.getElementById('appContainer').classList.add('active');
                    
                    // CARGAR ARCHIVOS CON MANEJO DE ERRORES
                    console.log('Cargando archivos del usuario...');
                    
                    try {
                        await FileService.loadUserDocuments();
                        console.log('Archivos cargados:', FileService.files.length);
                        
                        // Contar archivos que se cargaron correctamente
                        const loadedFiles = FileService.files.filter(f => !f.tooLarge).length;
                        const largeFiles = FileService.files.filter(f => f.tooLarge).length;
                        
                        if (largeFiles > 0) {
                            showNotification(`${loadedFiles} archivos cargados, ${largeFiles} archivos muy grandes (descárguelos para ver)`, 'warning');
                        }
                        // No mostrar notificación de éxito automáticamente
                        
                        DocumentService.renderDocumentSelector();
                        
                        if (document.getElementById('files-page')?.classList.contains('active')) {
                            FileService.renderFilesGrid();
                        }
                        
                    } catch (error) {
                        console.error('Error al cargar archivos:', error);
                        // No mostrar notificación de error
                    }
                    
                    // Cargar actividades
                    ActivityService.loadRecentActivities();
                    
                    showNotification(`¡Bienvenido a Cente Docs, ${userData.name}!`);
                }
            } else {
                console.log('No hay usuario autenticado');
                AppState.currentUser = null;
                FileService.files = [];
                document.getElementById('loginScreen').style.display = 'flex';
                document.getElementById('appContainer').classList.remove('active');
            }
        });
    }
}

// Sistema de Gestión de Archivos
class FileService {
    static files = [];
    
    static async uploadFiles(files) {
        const uploadedFiles = [];
        const storage = new CloudStorageService();
        
        for (const file of Array.from(files)) {
            try {
                const fileId = 'file_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
                
                // Comprimir archivo si es necesario (máximo aumentado a 2048KB)
                let fileToUpload = file;
                try {
                    fileToUpload = await CompressionService.compressFile(file, 2048);
                } catch (compressionError) {
                    // Si no se puede comprimir, verificar si es demasiado grande
                    if (fileToUpload.size > 50 * 1024 * 1024) {
                        showNotification(`Error: ${file.name} excede 50MB (tamaño máximo de Supabase)`, 'error');
                        continue;
                    } else {
                        console.warn(`Advertencia: ${compressionError.message}`);
                        // Continuar con el archivo original
                    }
                }
                
                // Subir directamente a Supabase
                try {
                    showNotification(`Subiendo ${file.name} a la nube...`);
                    
                    // Subir a Supabase Storage
                    const supabaseResult = await storage.supabase.uploadFile(
                        fileToUpload,
                        `users/${AppState.currentUser.uid}/uploads`
                    );
                    
                    // Preparar metadata SIN CONTENIDO BASE64
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
                    
                    // Guardar metadata en Firestore (sin contenido base64)
                    await storage.saveDocument(fileData);
                    
                    uploadedFiles.push(fileData);
                    this.files.push(fileData);
                    
                    await storage.saveActivity({
                        type: 'file_upload',
                        description: `Subió el archivo: ${file.name}`,
                        documentName: file.name,
                        userName: AppState.currentUser.name
                    });
                    
                    showNotification(`Archivo ${file.name} subido correctamente`);
                    
                } catch (supabaseError) {
                    console.error('Error subiendo a Supabase:', supabaseError);
                    showNotification(`Error al subir ${file.name}: ${supabaseError.message}`, 'error');
                }
                
            } catch (error) {
                console.error('Error uploading file:', error);
                showNotification(`Error al subir ${file.name}: ${error.message}`, 'error');
            }
        }
        
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
                `;
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
                document.removeEventListener('touchstart', removeTooltip);
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
            switchPage('documents');
            
            setTimeout(async () => {
                await DocumentService.loadDocument(file);
                showNotification(`Documento "${file.name}" cargado para edición/firma`);
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
            
            // TAMAÑO MÁS PEQUEÑO: 400x90 (anterior 500x120)
            const width = 400;
            const height = 90;
            canvas.width = width;
            canvas.height = height;
            
            ctx.clearRect(0, 0, width, height);
            
            const name = user.name;
            let nameLines = this.splitNameForLeftSide(name);
            
            const leftWidth = 180; // Reducido de 250
            
            // Nombre más pequeño
            ctx.font = 'bold 18px "Segoe UI", Tahoma, Geneva, Verdana, sans-serif';
            ctx.fillStyle = '#2f6c46';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            
            let nameY = (height - (nameLines.length * 22)) / 2;
            nameLines.forEach(line => {
                ctx.fillText(line, 10, nameY); // Reducido margen de 15 a 10
                nameY += 22;
            });
            
            // Línea divisoria más delgada
            ctx.strokeStyle = '#2f6c46';
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(leftWidth + 5, 10); // Reducido de 15
            ctx.lineTo(leftWidth + 5, height - 10); // Reducido de 15
            ctx.stroke();
            
            // Información más compacta
            ctx.font = '12px "Segoe UI", Tahoma, Geneva, Verdana, sans-serif';
            ctx.fillStyle = '#333333';
            ctx.textAlign = 'left';
            
            const now = new Date();
            const formattedDate = this.formatCompactDate(now);
            
            const lines = [
                `Firmado por: ${user.name}`,
                `Fecha: ${formattedDate}`
            ];
            
            let y = 20; // Reducido de 25
            const rightStartX = leftWidth + 10; // Reducido de 15
            
            lines.forEach(line => {
                ctx.fillText(line, rightStartX, y);
                y += 20; // Reducido de 22
            });
                        
            const dataURL = canvas.toDataURL('image/png');
            resolve(dataURL);
        });
    }

    // ===========================================
    // NUEVA FUNCIÓN: Formato de fecha más compacto
    // ===========================================
    static formatCompactDate(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        
        return `${day}/${month}/${year} ${hours}:${minutes}`;
    }

    static splitNameForLeftSide(fullName) {
        const words = fullName.trim().split(/\s+/);
        
        if (words.length === 4) {
            return [
                words[0] + ' ' + words[1],
                words[2] + ' ' + words[3]
            ];
        } else if (words.length === 3) {
            return [
                words[0] + ' ' + words[1],
                words[2]
            ];
        } else if (words.length === 2) {
            return [words[0], words[1]];
        } else {
            return [fullName];
        }
    }
    
    static formatDate(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        
        const timezoneOffset = -date.getTimezoneOffset();
        const offsetHours = String(Math.floor(Math.abs(timezoneOffset) / 60)).padStart(2, '0');
        const offsetMinutes = String(Math.abs(timezoneOffset) % 60).padStart(2, '0');
        const offsetSign = timezoneOffset >= 0 ? '+' : '-';
        
        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds} ${offsetSign}${offsetHours}:${offsetMinutes}`;
    }
    
    static async createUserSignature(user) {
        try {
            const signatureData = await this.generateAutomaticSignature(user);
            
            return {
                data: signatureData,
                type: 'auto',
                fileName: `firma_automatica_${user.name.replace(/\s+/g, '_')}.png`,
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
    static isDraggingSignature = false;
    static isResizingSignature = false;
    static currentDraggingSignature = null;
    static canvasClickHandler = null;
    static touchStartX = 0;
    static touchStartY = 0;
    static lastTouchTime = 0;
    static isTouchDevice = 'ontouchstart' in window;

    // ===========================================
    // NUEVO MÉTODO PARA BUSCAR POSICIÓN DE FIRMA AUTOMÁTICAMENTE
    // ===========================================
    static async findSignaturePosition() {
        return new Promise(async (resolve, reject) => {
            try {
                if (!this.currentDocument) {
                    resolve({ x: 100, y: 100 }); // Posición por defecto
                    return;
                }
                
                const canvas = document.getElementById('documentCanvas');
                if (!canvas) {
                    resolve({ x: 100, y: 100 });
                    return;
                }
                
                const width = canvas.width;
                const height = canvas.height;
                
                // Inteligencia para buscar espacios de firma
                let position = await this.analyzeDocumentForSignatureSpace(canvas);
                
                // Si no se encontró un buen espacio, usar posiciones comunes
                if (!position || position.x < 0 || position.y < 0) {
                    position = this.getCommonSignaturePositions(width, height);
                }
                
                // Asegurar que esté dentro del canvas
                position.x = Math.max(50, Math.min(position.x, width - 250));
                position.y = Math.max(50, Math.min(position.y, height - 100));
                
                console.log('Posición de firma encontrada:', position);
                resolve(position);
                
            } catch (error) {
                console.error('Error finding signature position:', error);
                resolve({ x: 100, y: 100 }); // Posición por defecto en caso de error
            }
        });
    }

    // ===========================================
    // REEMPLAZAR LA FUNCIÓN findSignaturePosition() COMPLETA
    // ===========================================

    static async findSignaturePosition() {
        return new Promise(async (resolve, reject) => {
            try {
                if (!this.currentDocument) {
                    resolve({ x: 100, y: 100 }); // Posición por defecto
                    return;
                }
                
                const canvas = document.getElementById('documentCanvas');
                if (!canvas) {
                    resolve({ x: 100, y: 100 });
                    return;
                }
                
                const width = canvas.width;
                const height = canvas.height;
                
                // Inteligencia para buscar espacios de firma
                let position = await this.analyzeDocumentForSignatureSpace(canvas);
                
                // Si no se encontró un buen espacio, usar posiciones comunes
                if (!position || position.x < 0 || position.y < 0) {
                    position = this.getCommonSignaturePositions(width, height);
                }
                
                // Asegurar que esté dentro del canvas
                position.x = Math.max(50, Math.min(position.x, width - 250));
                position.y = Math.max(50, Math.min(position.y, height - 100));
                
                console.log('Posición de firma encontrada:', position);
                resolve(position);
                
            } catch (error) {
                console.error('Error finding signature position:', error);
                resolve({ x: 100, y: 100 }); // Posición por defecto en caso de error
            }
        });
    }

    // ===========================================
    // NUEVA FUNCIÓN: Analizar documento para encontrar espacio de firma
    // ===========================================

    static async analyzeDocumentForSignatureSpace(canvas) {
        return new Promise((resolve) => {
            try {
                const ctx = canvas.getContext('2d');
                const width = canvas.width;
                const height = canvas.height;
                
                // Estrategia 1: Buscar en el tercio inferior del documento (área común de firma)
                const bottomThirdStartY = height * 0.66; // Comenzar a 2/3 del documento
                const searchArea = {
                    x: 0,
                    y: bottomThirdStartY,
                    width: width,
                    height: height - bottomThirdStartY
                };
                
                // Estrategia 2: Analizar el contenido para buscar líneas de firma
                // Tomar muestras de píxeles en el área de búsqueda
                const samplePoints = [];
                const sampleStep = 20; // Tomar muestras cada 20 píxeles
                
                for (let x = searchArea.x; x < searchArea.x + searchArea.width; x += sampleStep) {
                    for (let y = searchArea.y; y < searchArea.y + searchArea.height; y += sampleStep) {
                        samplePoints.push({ x, y });
                    }
                }
                
                // Buscar áreas con menos densidad de tinta (más claras)
                let bestPosition = null;
                let bestScore = -Infinity;
                
                // Dividir el área de búsqueda en una cuadrícula
                const gridSize = 10;
                const cellWidth = searchArea.width / gridSize;
                const cellHeight = searchArea.height / gridSize;
                
                for (let gridX = 0; gridX < gridSize; gridX++) {
                    for (let gridY = 0; gridY < gridSize; gridY++) {
                        const cellX = searchArea.x + (gridX * cellWidth);
                        const cellY = searchArea.y + (gridY * cellHeight);
                        
                        // Muestrear la celda
                        const samples = this.sampleCell(ctx, cellX, cellY, cellWidth, cellHeight);
                        
                        // Calcular puntuación basada en:
                        // 1. Brillo promedio (más claro es mejor)
                        // 2. Distancia a otras firmas existentes
                        // 3. Proximidad al borde derecho (las firmas suelen estar a la derecha)
                        
                        const brightnessScore = this.calculateBrightnessScore(samples);
                        const distanceScore = this.calculateDistanceScore(cellX, cellY);
                        const positionScore = this.calculatePositionScore(cellX, cellY, width, height);
                        
                        const totalScore = brightnessScore * 0.5 + distanceScore * 0.3 + positionScore * 0.2;
                        
                        if (totalScore > bestScore) {
                            bestScore = totalScore;
                            bestPosition = {
                                x: cellX + (cellWidth / 2),
                                y: cellY + (cellHeight / 2)
                            };
                        }
                    }
                }
                
                // Si encontramos una buena posición, usarla
                if (bestPosition && bestScore > 0.5) {
                    console.log('Espacio de firma encontrado con puntuación:', bestScore);
                    resolve(bestPosition);
                    return;
                }
                
                // Estrategia 3: Buscar líneas horizontales (líneas de firma)
                const linePositions = this.findSignatureLines(ctx, searchArea);
                if (linePositions.length > 0) {
                    // Usar la primera línea encontrada, ajustando la posición
                    const line = linePositions[0];
                    resolve({
                        x: line.x + (line.width / 2),
                        y: line.y + 30 // Colocar firma encima de la línea
                    });
                    return;
                }
                
                // Estrategia 4: Buscar áreas de texto que digan "firma" o similar
                // Nota: Esta sería una característica avanzada que requeriría OCR
                
                // Si ninguna estrategia funcionó, devolver posición no válida
                resolve({ x: -1, y: -1 });
                
            } catch (error) {
                console.error('Error analyzing document:', error);
                resolve({ x: -1, y: -1 });
            }
        });
    }

    // ===========================================
    // FUNCIONES AUXILIARES PARA ANÁLISIS DE DOCUMENTO
    // ===========================================

    static sampleCell(ctx, x, y, width, height) {
        const samples = [];
        const sampleCount = 5;
        
        for (let i = 0; i < sampleCount; i++) {
            const sampleX = x + Math.random() * width;
            const sampleY = y + Math.random() * height;
            
            // Obtener datos de píxel
            const imageData = ctx.getImageData(sampleX, sampleY, 1, 1).data;
            samples.push({
                r: imageData[0],
                g: imageData[1],
                b: imageData[2],
                a: imageData[3]
            });
        }
        
        return samples;
    }

    static calculateBrightnessScore(samples) {
        // Calcular el brillo promedio (0-255, donde 255 es blanco)
        let totalBrightness = 0;
        
        samples.forEach(sample => {
            // Fórmula de luminosidad perceptual
            const brightness = 0.299 * sample.r + 0.587 * sample.g + 0.114 * sample.b;
            totalBrightness += brightness;
        });
        
        const avgBrightness = totalBrightness / samples.length;
        
        // Normalizar a 0-1 (más brillante = mejor)
        return avgBrightness / 255;
    }

    static calculateDistanceScore(x, y) {
        // Calcular distancia a firmas existentes
        if (this.documentSignatures.length === 0) {
            return 1; // Máxima puntuación si no hay firmas
        }
        
        let minDistance = Infinity;
        
        this.documentSignatures.forEach(signature => {
            const distance = Math.sqrt(
                Math.pow(x - (signature.x + signature.width/2), 2) + 
                Math.pow(y - (signature.y + signature.height/2), 2)
            );
            
            if (distance < minDistance) {
                minDistance = distance;
            }
        });
        
        // Normalizar: más distancia = mejor (no superponer)
        // Considerar buena distancia si está a más de 200 píxeles
        const goodDistance = 200;
        return Math.min(minDistance / goodDistance, 1);
    }

    static calculatePositionScore(x, y, width, height) {
        // Preferir esquina inferior derecha para firmas
        const rightBias = 1 - (x / width); // Más cerca de la derecha = mejor
        const bottomBias = 1 - (y / height); // Más cerca del fondo = mejor
        
        return (rightBias * 0.7 + bottomBias * 0.3);
    }

    static getCommonSignaturePositions(width, height) {
        // Posiciones comunes donde se colocan las firmas
        const positions = [
            { x: width * 0.75, y: height * 0.85 }, // Esquina inferior derecha
            { x: width * 0.7, y: height * 0.8 },   // Centro-derecha inferior
            { x: width * 0.1, y: height * 0.85 },  // Esquina inferior izquierda
            { x: width * 0.5, y: height * 0.9 },   // Centro inferior
            { x: width * 0.3, y: height * 0.85 }   // Centro-izquierda inferior
        ];
        
        // Filtrar posiciones ocupadas por otras firmas
        const availablePositions = positions.filter(position => {
            for (const sig of this.documentSignatures) {
                const distance = Math.sqrt(
                    Math.pow(position.x - (sig.x + sig.width/2), 2) + 
                    Math.pow(position.y - (sig.y + sig.height/2), 2)
                );
                
                if (distance < 150) { // Si hay una firma muy cerca
                    return false;
                }
            }
            return true;
        });
        
        // Si hay posiciones disponibles, usar la primera
        if (availablePositions.length > 0) {
            return availablePositions[0];
        }
        
        // Si todas están ocupadas, crear nueva posición al lado de la última firma
        if (this.documentSignatures.length > 0) {
            const lastSig = this.documentSignatures[this.documentSignatures.length - 1];
            return {
                x: lastSig.x + lastSig.width + 20,
                y: lastSig.y
            };
        }
        
        // Si no hay firmas, usar la primera posición
        return positions[0];
    }

    static findSignatureLines(ctx, searchArea) {
        // Buscar líneas horizontales (posibles líneas de firma)
        const lines = [];
        const scanStep = 5; // Escanear cada 5 píxeles
        
        for (let y = searchArea.y; y < searchArea.y + searchArea.height; y += scanStep) {
            let lineStart = null;
            let lineLength = 0;
            
            for (let x = searchArea.x; x < searchArea.x + searchArea.width; x++) {
                const imageData = ctx.getImageData(x, y, 1, 1).data;
                const brightness = 0.299 * imageData[0] + 0.587 * imageData[1] + 0.114 * imageData[2];
                
                // Detectar píxeles oscuros (líneas)
                if (brightness < 100) {
                    if (lineStart === null) {
                        lineStart = x;
                    }
                    lineLength++;
                } else {
                    if (lineStart !== null && lineLength > 50) { // Línea de al menos 50 píxeles
                        lines.push({
                            x: lineStart,
                            y: y,
                            width: lineLength,
                            height: 1
                        });
                    }
                    lineStart = null;
                    lineLength = 0;
                }
            }
        }
        
        // Filtrar líneas que probablemente sean de firma (más largas y en el tercio inferior)
        return lines.filter(line => 
            line.width > 100 && // Al menos 100 píxeles de largo
            line.y > searchArea.y + (searchArea.height * 0.5) // En la mitad inferior del área de búsqueda
        );
    }

    // ===========================================
    // FUNCIONES AUXILIARES PARA ANÁLISIS DE DOCUMENTO
    // ===========================================

    static sampleCell(ctx, x, y, width, height) {
        const samples = [];
        const sampleCount = 5;
        
        for (let i = 0; i < sampleCount; i++) {
            const sampleX = x + Math.random() * width;
            const sampleY = y + Math.random() * height;
            
            // Obtener datos de píxel
            const imageData = ctx.getImageData(sampleX, sampleY, 1, 1).data;
            samples.push({
                r: imageData[0],
                g: imageData[1],
                b: imageData[2],
                a: imageData[3]
            });
        }
        
        return samples;
    }

    static calculateBrightnessScore(samples) {
        // Calcular el brillo promedio (0-255, donde 255 es blanco)
        let totalBrightness = 0;
        
        samples.forEach(sample => {
            // Fórmula de luminosidad perceptual
            const brightness = 0.299 * sample.r + 0.587 * sample.g + 0.114 * sample.b;
            totalBrightness += brightness;
        });
        
        const avgBrightness = totalBrightness / samples.length;
        
        // Normalizar a 0-1 (más brillante = mejor)
        return avgBrightness / 255;
    }

    static calculateDistanceScore(x, y) {
        // Calcular distancia a firmas existentes
        if (this.documentSignatures.length === 0) {
            return 1; // Máxima puntuación si no hay firmas
        }
        
        let minDistance = Infinity;
        
        this.documentSignatures.forEach(signature => {
            const distance = Math.sqrt(
                Math.pow(x - (signature.x + signature.width/2), 2) + 
                Math.pow(y - (signature.y + signature.height/2), 2)
            );
            
            if (distance < minDistance) {
                minDistance = distance;
            }
        });
        
        // Normalizar: más distancia = mejor (no superponer)
        // Considerar buena distancia si está a más de 200 píxeles
        const goodDistance = 200;
        return Math.min(minDistance / goodDistance, 1);
    }

    static calculatePositionScore(x, y, width, height) {
        // Preferir esquina inferior derecha para firmas
        const rightBias = 1 - (x / width); // Más cerca de la derecha = mejor
        const bottomBias = 1 - (y / height); // Más cerca del fondo = mejor
        
        return (rightBias * 0.7 + bottomBias * 0.3);
    }

    static getCommonSignaturePositions(width, height) {
        // Posiciones comunes donde se colocan las firmas
        const positions = [
            { x: width * 0.75, y: height * 0.85 }, // Esquina inferior derecha
            { x: width * 0.7, y: height * 0.8 },   // Centro-derecha inferior
            { x: width * 0.1, y: height * 0.85 },  // Esquina inferior izquierda
            { x: width * 0.5, y: height * 0.9 },   // Centro inferior
            { x: width * 0.3, y: height * 0.85 }   // Centro-izquierda inferior
        ];
        
        // Filtrar posiciones ocupadas por otras firmas
        const availablePositions = positions.filter(position => {
            for (const sig of this.documentSignatures) {
                const distance = Math.sqrt(
                    Math.pow(position.x - (sig.x + sig.width/2), 2) + 
                    Math.pow(position.y - (sig.y + sig.height/2), 2)
                );
                
                if (distance < 150) { // Si hay una firma muy cerca
                    return false;
                }
            }
            return true;
        });
        
        // Si hay posiciones disponibles, usar la primera
        if (availablePositions.length > 0) {
            return availablePositions[0];
        }
        
        // Si todas están ocupadas, crear nueva posición al lado de la última firma
        if (this.documentSignatures.length > 0) {
            const lastSig = this.documentSignatures[this.documentSignatures.length - 1];
            return {
                x: lastSig.x + lastSig.width + 20,
                y: lastSig.y
            };
        }
        
        // Si no hay firmas, usar la primera posición
        return positions[0];
    }

    static findSignatureLines(ctx, searchArea) {
        // Buscar líneas horizontales (posibles líneas de firma)
        const lines = [];
        const scanStep = 5; // Escanear cada 5 píxeles
        
        for (let y = searchArea.y; y < searchArea.y + searchArea.height; y += scanStep) {
            let lineStart = null;
            let lineLength = 0;
            
            for (let x = searchArea.x; x < searchArea.x + searchArea.width; x++) {
                const imageData = ctx.getImageData(x, y, 1, 1).data;
                const brightness = 0.299 * imageData[0] + 0.587 * imageData[1] + 0.114 * imageData[2];
                
                // Detectar píxeles oscuros (líneas)
                if (brightness < 100) {
                    if (lineStart === null) {
                        lineStart = x;
                    }
                    lineLength++;
                } else {
                    if (lineStart !== null && lineLength > 50) { // Línea de al menos 50 píxeles
                        lines.push({
                            x: lineStart,
                            y: y,
                            width: lineLength,
                            height: 1
                        });
                    }
                    lineStart = null;
                    lineLength = 0;
                }
            }
        }
        
        // Filtrar líneas que probablemente sean de firma (más largas y en el tercio inferior)
        return lines.filter(line => 
            line.width > 100 && // Al menos 100 píxeles de largo
            line.y > searchArea.y + (searchArea.height * 0.5) // En la mitad inferior del área de búsqueda
        );
    }

    // ===========================================
    // NUEVO: MÉTODO MEJORADO PARA INTERACTIVIDAD DE FIRMAS
    // ===========================================
    static makeSignatureInteractive(element, signatureData) {
        // Remover eventos previos si existen
        element.removeEventListener('mousedown', element._mouseHandler);
        element.removeEventListener('touchstart', element._touchHandler);
        
        // Handler para mouse
        const mouseHandler = (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            if (e.target.classList.contains('signature-handle')) {
                this.startResize(e, element, signatureData);
            } else {
                this.startDrag(e, element, signatureData);
            }
        };
        
        // Handler para touch
        const touchHandler = (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            if (e.touches.length === 1) {
                const touch = e.touches[0];
                
                // Guardar posición inicial del toque
                this.touchStartX = touch.clientX;
                this.touchStartY = touch.clientY;
                
                // Verificar si es toque en handle o en la firma
                const target = document.elementFromPoint(touch.clientX, touch.clientY);
                
                if (target && target.classList.contains('signature-handle')) {
                    this.isResizingSignature = true;
                    this.isDraggingSignature = false;
                    
                    // Simular evento mouse para resize
                    const mouseEvent = new MouseEvent('mousedown', {
                        clientX: touch.clientX,
                        clientY: touch.clientY,
                        bubbles: true,
                        cancelable: true,
                        view: window
                    });
                    target.dispatchEvent(mouseEvent);
                    
                } else {
                    this.isDraggingSignature = true;
                    this.isResizingSignature = false;
                    
                    // Simular evento mouse para drag
                    const mouseEvent = new MouseEvent('mousedown', {
                        clientX: touch.clientX,
                        clientY: touch.clientY,
                        bubbles: true,
                        cancelable: true,
                        view: window
                    });
                    element.dispatchEvent(mouseEvent);
                }
                
                // Guardar tiempo del toque
                this.lastTouchTime = Date.now();
            }
        };
        
        // Guardar referencias a los handlers
        element._mouseHandler = mouseHandler;
        element._touchHandler = touchHandler;
        
        // Agregar eventos
        element.addEventListener('mousedown', mouseHandler);
        element.addEventListener('touchstart', touchHandler, { passive: false });
        
        // Click para seleccionar
        element.addEventListener('click', (e) => {
            e.stopPropagation();
            this.selectSignature(element);
        });
        
        // Doble toque para seleccionar (móvil)
        element.addEventListener('touchend', (e) => {
            e.preventDefault();
            const currentTime = Date.now();
            const timeDiff = currentTime - this.lastTouchTime;
            
            // Si fue un toque rápido y no se arrastró, seleccionar
            if (timeDiff < 300 && !this.isDraggingSignature && !this.isResizingSignature) {
                this.selectSignature(element);
            }
            
            // Resetear estados
            setTimeout(() => {
                this.isDraggingSignature = false;
                this.isResizingSignature = false;
            }, 100);
        }, { passive: false });
        
        // Touch cancel
        element.addEventListener('touchcancel', () => {
            this.isDraggingSignature = false;
            this.isResizingSignature = false;
        });
        
        // Asegurar que las firmas sean seleccionables en móvil
        element.style.touchAction = 'none';
        element.style.userSelect = 'none';
        element.style.webkitUserSelect = 'none';
        
        // Añadir clase para móvil
        if (this.isTouchDevice) {
            element.classList.add('mobile-touch-enabled');
        }
    }

    // ===========================================
    // NUEVO: MÉTODO MEJORADO PARA ARRASTRAR
    // ===========================================
    static startDrag(e, element, signatureData) {
        e.preventDefault();
        e.stopPropagation();
        
        // Verificar si es touch o mouse
        const isTouch = e.type === 'touchstart' || e.type.startsWith('touch');
        this.isDraggingSignature = true;
        this.currentDraggingSignature = { element, signatureData };

        // Obtener coordenadas iniciales
        const startX = isTouch ? e.touches[0].clientX : e.clientX;
        const startY = isTouch ? e.touches[0].clientY : e.clientY;
        const startLeft = parseFloat(element.style.left);
        const startTop = parseFloat(element.style.top);
        
        // Obtener el contenedor del documento
        const container = document.getElementById('documentContainer');
        const canvas = document.getElementById('documentCanvas');
        
        // Función para mover
        const dragMove = (moveEvent) => {
            if (!this.isDraggingSignature) return;
            
            // Prevenir comportamiento por defecto (scroll)
            moveEvent.preventDefault();
            
            const currentX = isTouch ? moveEvent.touches[0].clientX : moveEvent.clientX;
            const currentY = isTouch ? moveEvent.touches[0].clientY : moveEvent.clientY;
            
            const dx = currentX - startX;
            const dy = currentY - startY;
            
            let newLeft = startLeft + dx;
            let newTop = startTop + dy;
            
            // Limitar al área del documento
            if (canvas) {
                const canvasRect = canvas.getBoundingClientRect();
                const elementRect = element.getBoundingClientRect();
                
                // Convertir coordenadas relativas al canvas
                const relativeLeft = newLeft / this.currentZoom;
                const relativeTop = newTop / this.currentZoom;
                const relativeWidth = element.offsetWidth / this.currentZoom;
                const relativeHeight = element.offsetHeight / this.currentZoom;
                
                // Asegurarse de que no salga del canvas
                if (relativeLeft < 0) newLeft = 0;
                if (relativeTop < 0) newTop = 0;
                if (relativeLeft + relativeWidth > canvas.width) {
                    newLeft = (canvas.width - relativeWidth) * this.currentZoom;
                }
                if (relativeTop + relativeHeight > canvas.height) {
                    newTop = (canvas.height - relativeHeight) * this.currentZoom;
                }
            }
            
            // Aplicar transformación
            element.style.left = newLeft + 'px';
            element.style.top = newTop + 'px';
            
            // Actualizar datos de la firma
            signatureData.x = newLeft;
            signatureData.y = newTop;
            
            // Forzar reflow para mejor rendimiento
            element.style.transform = 'translateZ(0)';
        };

        // Función para finalizar
        const dragEnd = () => {
            this.isDraggingSignature = false;
            this.currentDraggingSignature = null;
            
            if (isTouch) {
                document.removeEventListener('touchmove', dragMove);
                document.removeEventListener('touchend', dragEnd);
                document.removeEventListener('touchcancel', dragEnd);
            } else {
                document.removeEventListener('mousemove', dragMove);
                document.removeEventListener('mouseup', dragEnd);
            }
            
            // Resetear transformación
            element.style.transform = '';
            
            // Actualizar vista de firmas
            this.renderSignaturesList();
        };

        // Agregar event listeners
        if (isTouch) {
            document.addEventListener('touchmove', dragMove, { passive: false });
            document.addEventListener('touchend', dragEnd, { passive: false });
            document.addEventListener('touchcancel', dragEnd, { passive: false });
        } else {
            document.addEventListener('mousemove', dragMove);
            document.addEventListener('mouseup', dragEnd);
        }
    }

    // ===========================================
    // NUEVO: MÉTODO MEJORADO PARA REDIMENSIONAR
    // ===========================================
    static startResize(e, element, signatureData) {
        e.preventDefault();
        e.stopPropagation();
        
        const isTouch = e.type === 'touchstart' || e.type.startsWith('touch');
        const handle = e.target;
        
        // Obtener coordenadas iniciales
        const startX = isTouch ? e.touches[0].clientX : e.clientX;
        const startY = isTouch ? e.touches[0].clientY : e.clientY;
        const startWidth = parseFloat(element.style.width);
        const startHeight = parseFloat(element.style.height);
        const startLeft = parseFloat(element.style.left);
        const startTop = parseFloat(element.style.top);

        // Determinar qué handle se está usando
        const handleType = Array.from(handle.classList).find(cls => 
            cls.includes('handle-')
        );

        // Función para redimensionar
        const resizeMove = (moveEvent) => {
            moveEvent.preventDefault();
            
            const currentX = isTouch ? moveEvent.touches[0].clientX : moveEvent.clientX;
            const currentY = isTouch ? moveEvent.touches[0].clientY : moveEvent.clientY;
            
            const dx = currentX - startX;
            const dy = currentY - startY;

            let newWidth = startWidth;
            let newHeight = startHeight;
            let newLeft = startLeft;
            let newTop = startTop;

            // Tamaños mínimos (ajustados para móvil)
            const minWidth = this.isTouchDevice ? 80 : 50;
            const minHeight = this.isTouchDevice ? 50 : 30;

            // Calcular nuevo tamaño según el handle
            switch(handleType) {
                case 'handle-top-left':
                    newWidth = Math.max(minWidth, startWidth - dx);
                    newHeight = Math.max(minHeight, startHeight - dy);
                    newLeft = Math.max(0, startLeft + dx);
                    newTop = Math.max(0, startTop + dy);
                    break;
                    
                case 'handle-top-right':
                    newWidth = Math.max(minWidth, startWidth + dx);
                    newHeight = Math.max(minHeight, startHeight - dy);
                    newTop = Math.max(0, startTop + dy);
                    break;
                    
                case 'handle-bottom-left':
                    newWidth = Math.max(minWidth, startWidth - dx);
                    newHeight = Math.max(minHeight, startHeight + dy);
                    newLeft = Math.max(0, startLeft + dx);
                    break;
                    
                case 'handle-bottom-right':
                    newWidth = Math.max(minWidth, startWidth + dx);
                    newHeight = Math.max(minHeight, startHeight + dy);
                    break;
            }

            // Asegurar que no sea demasiado grande
            const canvas = document.getElementById('documentCanvas');
            if (canvas) {
                const maxWidth = canvas.clientWidth * 0.8;
                const maxHeight = canvas.clientHeight * 0.8;
                newWidth = Math.min(newWidth, maxWidth);
                newHeight = Math.min(newHeight, maxHeight);
            }

            // Aplicar cambios
            element.style.width = newWidth + 'px';
            element.style.height = newHeight + 'px';
            element.style.left = newLeft + 'px';
            element.style.top = newTop + 'px';

            // Actualizar datos
            signatureData.width = newWidth;
            signatureData.height = newHeight;
            signatureData.x = newLeft;
            signatureData.y = newTop;
            
            // Forzar reflow
            element.style.transform = 'translateZ(0)';
        };

        // Función para finalizar
        const resizeEnd = () => {
            this.isResizingSignature = false;
            
            if (isTouch) {
                document.removeEventListener('touchmove', resizeMove);
                document.removeEventListener('touchend', resizeEnd);
                document.removeEventListener('touchcancel', resizeEnd);
            } else {
                document.removeEventListener('mousemove', resizeMove);
                document.removeEventListener('mouseup', resizeEnd);
            }
            
            // Resetear transformación
            element.style.transform = '';
            
            // Actualizar vista
            this.renderSignaturesList();
        };

        // Agregar event listeners
        if (isTouch) {
            document.addEventListener('touchmove', resizeMove, { passive: false });
            document.addEventListener('touchend', resizeEnd, { passive: false });
            document.addEventListener('touchcancel', resizeEnd, { passive: false });
        } else {
            document.addEventListener('mousemove', resizeMove);
            document.addEventListener('mouseup', resizeEnd);
        }
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
        
        let width = originalWidth;
        let height = originalHeight;
        
        const scaleX = containerWidth / originalWidth;
        const scaleY = containerHeight / originalHeight;
        const scale = Math.min(scaleX, scaleY, 1.5) * qualityMultiplier;
        
        const minWidth = 600;
        const minHeight = 400;
        
        width = Math.max(originalWidth * scale, minWidth);
        height = Math.max(originalHeight * scale, minHeight);
        
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
            this.documentSignatures = [];
            this.currentSignature = null;
            this.currentZoom = 1.0;

            const signatureLayer = document.getElementById('signatureLayer');
            if (signatureLayer) {
                signatureLayer.innerHTML = '';
            }

            this.renderSignaturesList();

            this.currentDocument = {
                id: file.id,
                name: file.name,
                type: file.type,
                url: file.url, // Usar la URL reconstruida
                uploadDate: file.uploadDate || new Date(),
                uploadedBy: file.uploadedBy || AppState.currentUser.uid,
                uploadedByName: file.uploadedByName || AppState.currentUser.name,
                signatures: file.signatures || [],
                pages: file.pages || 1,
                size: file.size,
                extension: file.extension,
                source: file.source || 'uploaded'
            };
            
            if (file.signatures && file.signatures.length > 0) {
                this.documentSignatures = [...file.signatures];
            }
            
            setTimeout(async () => {
                try {
                    await this.renderDocument();
                    this.renderDocumentSelector();
                    this.renderSignaturesList();
                    this.initializeDocumentInteractions();
                    
                    this.applyRealZoom();
                    
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
        try {
            let pdfUrl = this.currentDocument.url;
            
            // Si es un placeholder, mostrar mensaje
            if (pdfUrl.includes('placeholder')) {
                this.showPDFFallback(canvas, ctx);
                return;
            }
            
            const loadingTask = pdfjsLib.getDocument(pdfUrl);
            const pdf = await loadingTask.promise;
            const page = await pdf.getPage(1);
            
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
            
            await page.render(renderContext).promise;
            
        } catch (error) {
            console.error('Error al renderizar PDF:', error);
            this.showPDFFallback(canvas, ctx);
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
            const originalWidth = canvas.width;
            const originalHeight = canvas.height;
            
            const scaledWidth = originalWidth * this.currentZoom;
            const scaledHeight = originalHeight * this.currentZoom;
            
            canvas.style.width = scaledWidth + 'px';
            canvas.style.height = scaledHeight + 'px';
            
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
        if (!canvas) return;
        
        const originalWidth = canvas.width / this.currentZoom;
        const originalHeight = canvas.height / this.currentZoom;
        
        this.documentSignatures.forEach(signature => {
            const signatureElement = document.querySelector(`[data-signature-id="${signature.id}"]`);
            if (signatureElement) {
                const scaledX = (signature.x / originalWidth) * canvas.width;
                const scaledY = (signature.y / originalHeight) * canvas.height;
                const scaledWidth = (signature.width / originalWidth) * canvas.width;
                const scaledHeight = (signature.height / originalHeight) * canvas.height;
                
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
        
        this.documentSignatures.forEach(signature => {
            const signatureElement = this.createSignatureElement(signature);
            signatureLayer.appendChild(signatureElement);
        });
        
        this.repositionSignaturesForZoom();
    }

    static createSignatureElement(signature) {
        const signatureElement = document.createElement('div');
        signatureElement.className = 'document-signature';
        signatureElement.style.left = signature.x + 'px';
        signatureElement.style.top = signature.y + 'px';
        signatureElement.style.width = signature.width + 'px';
        signatureElement.style.height = signature.height + 'px';
        signatureElement.dataset.signatureId = signature.id;
        
        signatureElement.innerHTML = `
            <img src="${signature.data}" alt="Firma de ${signature.userName}" onerror="this.style.display='none'" style="image-rendering: -webkit-optimize-contrast; image-rendering: crisp-edges; background: transparent !important;">
            <div class="signature-handle handle-top-left"></div>
            <div class="signature-handle handle-top-right"></div>
            <div class="signature-handle handle-bottom-left"></div>
            <div class="signature-handle handle-bottom-right"></div>
        `;
        
        // USAR EL NUEVO MÉTODO MEJORADO
        this.makeSignatureInteractive(signatureElement, signature);
        return signatureElement;
    }

    // ===========================================
    // REEMPLAZAR: enableSignatureMode
    // ===========================================
    static enableSignatureMode() {
        this.isSignatureMode = false; // Ya no necesitamos modo de clic
        document.body.classList.remove('signature-mode-active'); // Quitar clase CSS
        
        const canvas = document.getElementById('documentCanvas');
        const signatureLayer = document.getElementById('signatureLayer');
        
        if (canvas) canvas.style.cursor = 'default';
        if (signatureLayer) signatureLayer.style.pointerEvents = 'auto';
        
        // NO agregar event listener de clic
        this.canvasClickHandler = null;
        
        // Ahora colocamos la firma automáticamente
        this.addSignatureToDocument();
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
    // MODIFICAR addSignatureToDocument para mejor manejo de posición
    // ===========================================
    static async addSignatureToDocument() {
        if (!this.currentSignature) {
            showNotification('No hay firma seleccionada', 'error');
            return;
        }

        if (!this.currentDocument) {
            showNotification('Primero selecciona un documento', 'error');
            return;
        }

        try {
            // Buscar posición inteligente mejorada
            const position = await this.findSmartSignaturePosition();
            
            console.log('🎯 Posición encontrada para firma:', position);
            
            let width, height;
            const canvas = document.getElementById('documentCanvas');
            const canvasWidth = canvas ? canvas.width : 800;
            const canvasHeight = canvas ? canvas.height : 600;
            
            if (this.currentSignature.type === 'upload') {
                const img = new Image();
                img.src = this.currentSignature.data;
                
                await new Promise((resolve, reject) => {
                    img.onload = resolve;
                    img.onerror = reject;
                });
                
                // Tamaños ajustados
                const maxWidth = 160; // Más pequeño
                const maxHeight = 80;  // Más pequeño
                
                width = img.naturalWidth;
                height = img.naturalHeight;
                
                // Mantener proporción
                if (width > maxWidth || height > maxHeight) {
                    const ratio = Math.min(maxWidth / width, maxHeight / height);
                    width = Math.round(width * ratio);
                    height = Math.round(height * ratio);
                }
                
                // Asegurar tamaño mínimo
                if (width < 50) width = 50;
                if (height < 25) height = 25;
            } else {
                // Para firma automática, tamaño compacto
                width = 180;  // Compacto
                height = 65;  // Compacto
            }

            const signature = {
                id: 'sig_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                data: this.currentSignature.data,
                userName: AppState.currentUser.name,
                userEmail: AppState.currentUser.email,
                x: position.x,
                y: position.y,
                width: width,
                height: height,
                timestamp: new Date(),
                type: this.currentSignature.type,
                placedBy: 'smart_detection'
            };
            
            // Ajustar posición para que no salga del canvas
            if (canvas) {
                // Asegurar que la firma quepa
                if (signature.x + signature.width > canvasWidth) {
                    signature.x = canvasWidth - signature.width - 20;
                }
                if (signature.y + signature.height > canvasHeight) {
                    signature.y = canvasHeight - signature.height - 20;
                }
                
                // Asegurar posición mínima
                signature.x = Math.max(20, signature.x);
                signature.y = Math.max(20, signature.y);
                
                // Si la posición parece incorrecta, ajustar
                if (signature.x > canvasWidth * 0.9) {
                    signature.x = canvasWidth * 0.7;
                }
            }
            
            this.documentSignatures.push(signature);
            if (this.currentDocument) {
                this.currentDocument.signatures = this.documentSignatures;
            }
            
            this.renderExistingSignatures();
            this.renderSignaturesList();
            
            // Mostrar feedback visual
            setTimeout(() => {
                const signatureElement = document.querySelector(`[data-signature-id="${signature.id}"]`);
                if (signatureElement) {
                    signatureElement.classList.add('highlight-new');
                    setTimeout(() => {
                        signatureElement.classList.remove('highlight-new');
                    }, 1500);
                }
            }, 100);
            
            showNotification('✓ Firma colocada inteligentemente');
            
        } catch (error) {
            console.error('Error al agregar firma:', error);
            showNotification('Error al agregar la firma', 'error');
        }
    }

    // ===========================================
    // REEMPLAZAR: findSmartSignaturePosition con versión MEJORADA
    // ===========================================
    static async findSmartSignaturePosition() {
        return new Promise(async (resolve, reject) => {
            try {
                if (!this.currentDocument) {
                    resolve({ x: 120, y: 120 });
                    return;
                }
                
                const canvas = document.getElementById('documentCanvas');
                if (!canvas) {
                    resolve({ x: 120, y: 120 });
                    return;
                }
                
                const ctx = canvas.getContext('2d');
                const width = canvas.width;
                const height = canvas.height;
                
                console.log('🔍 Buscando espacio para firma...');
                
                // PRIMERO: Buscar líneas de firma específicas
                const signatureLine = await this.findSignatureLine(ctx, width, height);
                if (signatureLine.found) {
                    console.log('✅ Encontrada línea de firma:', signatureLine);
                    resolve({ 
                        x: signatureLine.x, 
                        y: signatureLine.y - 25 // Colocar 25px arriba de la línea
                    });
                    return;
                }
                
                // SEGUNDO: Buscar texto "firma" o similar
                const signatureText = await this.findSignatureText(ctx, width, height);
                if (signatureText.found) {
                    console.log('✅ Encontrado texto de firma:', signatureText);
                    resolve({ 
                        x: signatureText.x + signatureText.width + 10, 
                        y: signatureText.y 
                    });
                    return;
                }
                
                // TERCERO: Buscar áreas vacías cerca del final del documento
                const emptyArea = this.findEmptyAreaForSignature(ctx, width, height);
                if (emptyArea.found) {
                    console.log('✅ Encontrada área vacía:', emptyArea);
                    resolve({ x: emptyArea.x, y: emptyArea.y });
                    return;
                }
                
                // CUARTO: Si hay firmas existentes, colocar al lado
                if (this.documentSignatures.length > 0) {
                    const lastSignature = this.documentSignatures[this.documentSignatures.length - 1];
                    let newX = lastSignature.x + lastSignature.width + 20;
                    let newY = lastSignature.y;
                    
                    if (newX + 180 > width) {
                        newX = 50;
                        newY = lastSignature.y + lastSignature.height + 20;
                    }
                    
                    if (newY + 70 > height) {
                        newY = Math.max(50, height - 120);
                    }
                    
                    console.log('📌 Colocando al lado de firma existente');
                    resolve({ x: newX, y: newY });
                    return;
                }
                
                // QUINTO: Posiciones predeterminadas inteligentes
                const defaultPosition = this.getDefaultSignaturePosition(width, height);
                console.log('📍 Usando posición predeterminada');
                resolve(defaultPosition);
                
            } catch (error) {
                console.error('Error en findSmartSignaturePosition:', error);
                resolve({ x: width * 0.7 - 100, y: height * 0.8 - 35 });
            }
        });
    }

    // ===========================================
    // NUEVA FUNCIÓN: Buscar línea de firma
    // ===========================================
    static async findSignatureLine(ctx, width, height) {
        return new Promise((resolve) => {
            try {
                // Buscar en el tercio inferior del documento
                const startY = height * 0.7;
                const endY = height * 0.95;
                const searchHeight = endY - startY;
                
                // Escanear horizontalmente para encontrar líneas
                const lineCandidates = [];
                const scanStep = 3; // Escanear cada 3 píxeles en Y
                
                for (let y = startY; y < endY; y += scanStep) {
                    let lineLength = 0;
                    let lineStartX = 0;
                    let maxLineLength = 0;
                    let maxLineStartX = 0;
                    
                    // Escanear toda la fila horizontal
                    for (let x = 0; x < width; x++) {
                        const pixel = ctx.getImageData(x, y, 1, 1).data;
                        const brightness = (pixel[0] + pixel[1] + pixel[2]) / 3;
                        
                        // Detectar píxel oscuro (línea)
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
                    
                    // Verificar si encontramos una línea larga
                    if (maxLineLength > 80) { // Línea de al menos 80px
                        lineCandidates.push({
                            y: y,
                            x: maxLineStartX + (maxLineLength / 2),
                            length: maxLineLength,
                            startX: maxLineStartX,
                            endX: maxLineStartX + maxLineLength
                        });
                    }
                }
                
                // Ordenar candidatos por longitud (más largos primero)
                lineCandidates.sort((a, b) => b.length - a.length);
                
                // Verificar el mejor candidato
                if (lineCandidates.length > 0) {
                    const bestLine = lineCandidates[0];
                    
                    // Verificar que encima de la línea haya espacio para firma
                    const spaceAbove = this.checkSpaceAboveLine(ctx, bestLine.x, bestLine.y, width);
                    if (spaceAbove.hasSpace) {
                        resolve({
                            found: true,
                            x: spaceAbove.x,
                            y: bestLine.y,
                            lineLength: bestLine.length,
                            type: 'line'
                        });
                        return;
                    }
                }
                
                resolve({ found: false, x: 0, y: 0 });
                
            } catch (error) {
                console.error('Error en findSignatureLine:', error);
                resolve({ found: false, x: 0, y: 0 });
            }
        });
    }

    // ===========================================
    // NUEVA FUNCIÓN: Buscar texto "firma" o similar
    // ===========================================
    static async findSignatureText(ctx, width, height) {
        return new Promise((resolve) => {
            try {
                // Patrones de búsqueda (sinónimos de firma)
                const signatureWords = [
                    'firma', 'firmado', 'firmante', 'signature', 'signed',
                    'nombre', 'name', 'fecha', 'date', 'aprobado', 'approved'
                ];
                
                // Áreas comunes donde aparece texto de firma
                const searchAreas = [
                    { x: 0, y: height * 0.7, width: width * 0.3, height: height * 0.25 }, // Izquierda inferior
                    { x: width * 0.7, y: height * 0.7, width: width * 0.3, height: height * 0.25 }, // Derecha inferior
                    { x: width * 0.35, y: height * 0.8, width: width * 0.3, height: height * 0.15 }, // Centro inferior
                ];
                
                // Escanear cada área de búsqueda
                for (const area of searchAreas) {
                    const textArea = this.findTextArea(ctx, area);
                    if (textArea.found) {
                        // Verificar si el área podría contener texto de firma
                        if (this.looksLikeSignatureArea(ctx, textArea)) {
                            resolve({
                                found: true,
                                x: textArea.x,
                                y: textArea.y,
                                width: textArea.width,
                                height: textArea.height,
                                type: 'text_area'
                            });
                            return;
                        }
                    }
                }
                
                resolve({ found: false, x: 0, y: 0 });
                
            } catch (error) {
                console.error('Error en findSignatureText:', error);
                resolve({ found: false, x: 0, y: 0 });
            }
        });
    }

    // ===========================================
    // NUEVA FUNCIÓN: Buscar área de texto
    // ===========================================
    static findTextArea(ctx, searchArea) {
        try {
            // Escanear para encontrar áreas con densidad de texto
            const gridSize = 10;
            const cellWidth = searchArea.width / gridSize;
            const cellHeight = searchArea.height / gridSize;
            
            let textCells = [];
            
            for (let gridY = 0; gridY < gridSize; gridY++) {
                for (let gridX = 0; gridX < gridSize; gridX++) {
                    const cellX = searchArea.x + (gridX * cellWidth);
                    const cellY = searchArea.y + (gridY * cellHeight);
                    
                    // Muestrear la celda
                    const textDensity = this.calculateTextDensity(ctx, cellX, cellY, cellWidth, cellHeight);
                    
                    if (textDensity > 0.3) { // Celda con bastante texto
                        textCells.push({
                            x: cellX,
                            y: cellY,
                            density: textDensity
                        });
                    }
                }
            }
            
            // Agrupar celdas cercanas
            if (textCells.length > 0) {
                const avgX = textCells.reduce((sum, cell) => sum + cell.x, 0) / textCells.length;
                const avgY = textCells.reduce((sum, cell) => sum + cell.y, 0) / textCells.length;
                
                return {
                    found: true,
                    x: avgX,
                    y: avgY,
                    width: cellWidth * 2,
                    height: cellHeight * 2,
                    cellCount: textCells.length
                };
            }
            
            return { found: false, x: 0, y: 0 };
            
        } catch (error) {
            return { found: false, x: 0, y: 0 };
        }
    }

    // ===========================================
    // NUEVA FUNCIÓN: Calcular densidad de texto
    // ===========================================
    static calculateTextDensity(ctx, x, y, width, height) {
        try {
            const sampleStep = 5;
            let darkPixels = 0;
            let totalSamples = 0;
            
            for (let sampleY = y; sampleY < y + height; sampleY += sampleStep) {
                for (let sampleX = x; sampleX < x + width; sampleX += sampleStep) {
                    const pixel = ctx.getImageData(sampleX, sampleY, 1, 1).data;
                    const brightness = (pixel[0] + pixel[1] + pixel[2]) / 3;
                    
                    if (brightness < 150) { // Píxel oscuro (posible texto)
                        darkPixels++;
                    }
                    totalSamples++;
                }
            }
            
            return totalSamples > 0 ? darkPixels / totalSamples : 0;
            
        } catch (error) {
            return 0;
        }
    }

    // ===========================================
    // NUEVA FUNCIÓN: Verificar si área parece ser para firma
    // ===========================================
    static looksLikeSignatureArea(ctx, area) {
        try {
            // Verificar si al lado derecho hay espacio vacío (para colocar firma)
            const rightSpace = this.checkRightSpace(ctx, area.x + area.width, area.y, 150, area.height);
            
            // Verificar si debajo hay espacio vacío
            const belowSpace = this.checkBelowSpace(ctx, area.x, area.y + area.height, area.width, 100);
            
            // Si hay espacio al lado o abajo, es probable que sea área de firma
            return rightSpace.hasSpace || belowSpace.hasSpace;
            
        } catch (error) {
            return false;
        }
    }

    // ===========================================
    // NUEVA FUNCIÓN: Verificar espacio encima de línea
    // ===========================================
    static checkSpaceAboveLine(ctx, lineX, lineY, width) {
        try {
            const checkHeight = 50;
            const checkWidth = 180;
            const startX = Math.max(0, lineX - checkWidth / 2);
            const startY = Math.max(0, lineY - checkHeight);
            
            let emptySpots = [];
            
            // Escanear área encima de la línea
            for (let y = startY; y < lineY; y += 5) {
                for (let x = startX; x < startX + checkWidth && x < width; x += 5) {
                    const pixel = ctx.getImageData(x, y, 1, 1).data;
                    const brightness = (pixel[0] + pixel[1] + pixel[2]) / 3;
                    
                    if (brightness > 200) { // Área muy clara
                        emptySpots.push({ x, y, brightness });
                    }
                }
            }
            
            if (emptySpots.length > 10) { // Suficientes puntos claros
                // Encontrar el punto más claro
                const bestSpot = emptySpots.sort((a, b) => b.brightness - a.brightness)[0];
                return {
                    hasSpace: true,
                    x: bestSpot.x,
                    y: bestSpot.y
                };
            }
            
            return { hasSpace: false, x: 0, y: 0 };
            
        } catch (error) {
            return { hasSpace: false, x: 0, y: 0 };
        }
    }

    // ===========================================
    // NUEVA FUNCIÓN: Verificar espacio a la derecha
    // ===========================================
    static checkRightSpace(ctx, startX, startY, checkWidth, checkHeight) {
        try {
            let clearPixels = 0;
            let totalPixels = 0;
            
            for (let y = startY; y < startY + checkHeight; y += 3) {
                for (let x = startX; x < startX + checkWidth; x += 3) {
                    const pixel = ctx.getImageData(x, y, 1, 1).data;
                    const brightness = (pixel[0] + pixel[1] + pixel[2]) / 3;
                    
                    if (brightness > 220) { // Muy claro
                        clearPixels++;
                    }
                    totalPixels++;
                }
            }
            
            if (totalPixels > 0 && (clearPixels / totalPixels) > 0.8) {
                return {
                    hasSpace: true,
                    x: startX + 10,
                    y: startY
                };
            }
            
            return { hasSpace: false, x: 0, y: 0 };
            
        } catch (error) {
            return { hasSpace: false, x: 0, y: 0 };
        }
    }

    // ===========================================
    // NUEVA FUNCIÓN: Verificar espacio abajo
    // ===========================================
    static checkBelowSpace(ctx, startX, startY, checkWidth, checkHeight) {
        try {
            let clearPixels = 0;
            let totalPixels = 0;
            
            for (let y = startY; y < startY + checkHeight; y += 3) {
                for (let x = startX; x < startX + checkWidth; x += 3) {
                    const pixel = ctx.getImageData(x, y, 1, 1).data;
                    const brightness = (pixel[0] + pixel[1] + pixel[2]) / 3;
                    
                    if (brightness > 220) {
                        clearPixels++;
                    }
                    totalPixels++;
                }
            }
            
            if (totalPixels > 0 && (clearPixels / totalPixels) > 0.8) {
                return {
                    hasSpace: true,
                    x: startX,
                    y: startY + 10
                };
            }
            
            return { hasSpace: false, x: 0, y: 0 };
            
        } catch (error) {
            return { hasSpace: false, x: 0, y: 0 };
        }
    }

    // ===========================================
    // NUEVA FUNCIÓN: Encontrar área vacía para firma
    // ===========================================
    static findEmptyAreaForSignature(ctx, width, height) {
        try {
            // Priorizar estas áreas (donde normalmente van las firmas)
            const priorityAreas = [
                { x: width * 0.7, y: height * 0.8, label: 'esquina_inf_derecha' },
                { x: width * 0.1, y: height * 0.8, label: 'esquina_inf_izquierda' },
                { x: width * 0.45, y: height * 0.85, label: 'centro_inferior' },
                { x: width * 0.7, y: height * 0.15, label: 'esquina_sup_derecha' },
                { x: width * 0.1, y: height * 0.15, label: 'esquina_sup_izquierda' }
            ];
            
            // Verificar cada área prioritaria
            for (const area of priorityAreas) {
                const isEmpty = this.checkAreaEmpty(ctx, area.x, area.y, 200, 80);
                if (isEmpty) {
                    return {
                        found: true,
                        x: area.x,
                        y: area.y,
                        label: area.label
                    };
                }
            }
            
            // Si no se encuentra en áreas prioritarias, buscar en todo el tercio inferior
            for (let attempt = 0; attempt < 5; attempt++) {
                const randomX = 50 + Math.random() * (width - 250);
                const randomY = height * 0.7 + Math.random() * (height * 0.25);
                
                const isEmpty = this.checkAreaEmpty(ctx, randomX, randomY, 180, 70);
                if (isEmpty) {
                    return {
                        found: true,
                        x: randomX,
                        y: randomY,
                        label: 'random_search'
                    };
                }
            }
            
            return { found: false, x: 0, y: 0 };
            
        } catch (error) {
            return { found: false, x: 0, y: 0 };
        }
    }

    // ===========================================
    // NUEVA FUNCIÓN: Verificar si área está vacía
    // ===========================================
    static checkAreaEmpty(ctx, x, y, width, height) {
        try {
            const sampleStep = 4;
            let darkPixels = 0;
            let totalSamples = 0;
            
            for (let sampleY = y; sampleY < y + height; sampleY += sampleStep) {
                for (let sampleX = x; sampleX < x + width; sampleX += sampleStep) {
                    const pixel = ctx.getImageData(sampleX, sampleY, 1, 1).data;
                    const brightness = (pixel[0] + pixel[1] + pixel[2]) / 3;
                    
                    if (brightness < 180) { // Píxel oscuro
                        darkPixels++;
                    }
                    totalSamples++;
                }
            }
            
            // Considerar vacío si menos del 10% son píxeles oscuros
            return totalSamples > 0 && (darkPixels / totalSamples) < 0.1;
            
        } catch (error) {
            return false;
        }
    }

    // ===========================================
    // NUEVA FUNCIÓN: Obtener posición predeterminada
    // ===========================================
    static getDefaultSignaturePosition(width, height) {
        // Posiciones ordenadas por prioridad
        const positions = [
            { x: width * 0.75 - 100, y: height * 0.85 - 35 }, // Esquina inf derecha
            { x: width * 0.1, y: height * 0.85 - 35 },        // Esquina inf izquierda
            { x: width * 0.4, y: height * 0.9 - 35 },         // Centro inferior
            { x: width * 0.7 - 100, y: height * 0.15 },       // Esquina sup derecha
            { x: width * 0.1, y: height * 0.15 }              // Esquina sup izquierda
        ];
        
        return positions[0]; // Siempre usar la primera como predeterminada
    }

    // ===========================================
    // NUEVA FUNCIÓN: Escanear área específica para espacio de firma
    // ===========================================
    static scanAreaForSignature(ctx, startX, startY, areaWidth, areaHeight) {
        try {
            const samplePoints = 20;
            const stepX = Math.floor(areaWidth / samplePoints);
            const stepY = Math.floor(areaHeight / samplePoints);
            
            let bestSpot = null;
            let bestBrightness = 0;
            
            // Escanear la cuadrícula
            for (let x = startX; x < startX + areaWidth; x += stepX) {
                for (let y = startY; y < startY + areaHeight; y += stepY) {
                    // Obtener color del píxel
                    const imageData = ctx.getImageData(x, y, 1, 1);
                    const pixel = imageData.data;
                    
                    // Calcular brillo (0-255)
                    const brightness = (pixel[0] + pixel[1] + pixel[2]) / 3;
                    
                    // Si es un área clara (blanca o casi blanca)
                    if (brightness > 200) {
                        // Verificar un área de 50x50 píxeles alrededor
                        const areaBrightness = this.checkAreaBrightness(ctx, x, y, 50, 50);
                        
                        if (areaBrightness > bestBrightness) {
                            bestBrightness = areaBrightness;
                            bestSpot = { x, y };
                        }
                    }
                }
            }
            
            if (bestSpot) {
                console.log(`Área encontrada con brillo: ${bestBrightness}`);
                return {
                    found: true,
                    x: bestSpot.x,
                    y: bestSpot.y,
                    brightness: bestBrightness
                };
            }
            
            return { found: false, x: 0, y: 0 };
            
        } catch (error) {
            console.error('Error en scanAreaForSignature:', error);
            return { found: false, x: 0, y: 0 };
        }
    }

    // ===========================================
    // NUEVA FUNCIÓN: Verificar brillo de un área
    // ===========================================
    static checkAreaBrightness(ctx, centerX, centerY, areaWidth, areaHeight) {
        const sampleSize = 5;
        let totalBrightness = 0;
        let sampleCount = 0;
        
        const startX = Math.max(0, centerX - areaWidth / 2);
        const startY = Math.max(0, centerY - areaHeight / 2);
        const endX = startX + areaWidth;
        const endY = startY + areaHeight;
        
        for (let x = startX; x < endX; x += sampleSize) {
            for (let y = startY; y < endY; y += sampleSize) {
                try {
                    const imageData = ctx.getImageData(x, y, 1, 1);
                    const pixel = imageData.data;
                    const brightness = (pixel[0] + pixel[1] + pixel[2]) / 3;
                    totalBrightness += brightness;
                    sampleCount++;
                } catch (e) {
                    // Ignorar píxeles fuera del canvas
                }
            }
        }
        
        return sampleCount > 0 ? totalBrightness / sampleCount : 0;
    }

    // ===========================================
    // REEMPLAZAR: setCurrentSignature
    // ===========================================
    static setCurrentSignature(signatureData) {
        this.currentSignature = signatureData;
        // Ya no activamos modo firma, llamamos directamente a enableSignatureMode
        // que ahora agregará automáticamente la firma
        this.enableSignatureMode();
        showNotification('Firma seleccionada - Se colocará automáticamente');
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
        
        if (!signaturesGrid || !noSignatures) return;
        
        if (this.documentSignatures.length === 0) {
            noSignatures.style.display = 'flex';
            signaturesGrid.innerHTML = '';
            signaturesGrid.appendChild(noSignatures);
            return;
        }
        
        noSignatures.style.display = 'none';
        signaturesGrid.innerHTML = '';
        
        this.documentSignatures.forEach(signature => {
            const signatureBadge = document.createElement('div');
            signatureBadge.className = 'signature-badge';
            signatureBadge.innerHTML = `
                <div class="signature-avatar">${signature.userName.substring(0, 2).toUpperCase()}</div>
                <div class="signature-user">${signature.userName}</div>
            `;
            signaturesGrid.appendChild(signatureBadge);
        });
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

    static async combineWithPDF() {
        return new Promise(async (resolve, reject) => {
            try {
                const loadingTask = pdfjsLib.getDocument(DocumentService.currentDocument.url);
                const pdf = await loadingTask.promise;
                const page = await pdf.getPage(1);
                
                const scale = 2.0;
                const viewport = page.getViewport({ scale });
                
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                
                const renderContext = {
                    canvasContext: ctx,
                    viewport: viewport
                };
                
                await page.render(renderContext).promise;

                const displayCanvas = document.getElementById('documentCanvas');
                const signatureLayer = document.getElementById('signatureLayer');
                
                const scaleFactorX = canvas.width / displayCanvas.width;
                const scaleFactorY = canvas.height / displayCanvas.height;
                
                const signatures = signatureLayer.querySelectorAll('.document-signature');
                for (const signature of signatures) {
                    const img = signature.querySelector('img');
                    if (img && img.src) {
                        await this.waitForImageLoad(img);
                        const x = parseFloat(signature.style.left) * scaleFactorX;
                        const y = parseFloat(signature.style.top) * scaleFactorY;
                        const width = parseFloat(signature.style.width) * scaleFactorX;
                        const height = parseFloat(signature.style.height) * scaleFactorY;
                        
                        ctx.imageSmoothingEnabled = true;
                        ctx.imageSmoothingQuality = 'high';
                        ctx.drawImage(img, x, y, width, height);
                    }
                }

                const { jsPDF } = window.jspdf;
                const pdfOutput = new jsPDF({
                    orientation: canvas.width > canvas.height ? 'landscape' : 'portrait',
                    unit: 'px',
                    format: [canvas.width, canvas.height]
                });

                const imgData = canvas.toDataURL('image/png', 1.0);
                pdfOutput.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height, undefined, 'FAST');
                
                const pdfBlob = pdfOutput.output('blob');
                const pdfUrl = URL.createObjectURL(pdfBlob);
                
                resolve({
                    blob: pdfBlob,
                    url: pdfUrl,
                    type: 'application/pdf',
                    fileName: `documento_firmado_${Date.now()}.pdf`
                });

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
                
                const scaleFactorX = canvas.width / displayCanvas.width;
                const scaleFactorY = canvas.height / displayCanvas.height;
                
                const signatures = signatureLayer.querySelectorAll('.document-signature');
                for (const signature of signatures) {
                    const imgSignature = signature.querySelector('img');
                    if (imgSignature && imgSignature.src) {
                        await this.waitForImageLoad(imgSignature);
                        const x = parseFloat(signature.style.left) * scaleFactorX;
                        const y = parseFloat(signature.style.top) * scaleFactorY;
                        const width = parseFloat(signature.style.width) * scaleFactorX;
                        const height = parseFloat(signature.style.height) * scaleFactorY;
                        ctx.imageSmoothingEnabled = true;
                        ctx.imageSmoothingQuality = 'high';
                        ctx.drawImage(imgSignature, x, y, width, height);
                                           ctx.imageSmoothingEnabled = true;
                        ctx.imageSmoothingQuality = 'high';
                        ctx.drawImage(imgSignature, x, y, width, height);
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
        
        this.documentSignatures = [];
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
    AuthService.initAuthListener();

    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const email = document.getElementById('email');
            const password = document.getElementById('password');
            
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
    
    const registerBtn = document.getElementById('registerBtn');
    if (registerBtn) {
        registerBtn.addEventListener('click', async function() {
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            
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