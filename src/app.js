/**********************************************************************************************************************************************************************************
 * Objetivo: API responsável pelas requisições do assinar pdf automaticamente
 * Data: 12/12/2025
 * Autor: Kauan Rodrigues 
 * Versões: 1.0
 * Observações:
 * ************ Para criar a API precisamos instalar:
 *              express   npm install express --savenpm start
 # ou
 npm run dev

 *              cors        npm install cors --save
 *              body-parser npm install body-parser --save
 * ************* Para criar conexão com o banco de dados MYSQL precisamos instalar:
 *               prisma        npm install prisma --save
 *               prisma/client npm install @prisma/client --save
 * 
 * Após a instalação do prisma é necessário inicializar o prisma:
 *             npx prisma init 
 * Para sincronização do prisma com o banco de dados podemos utilizar:
 *             npx prisma migrate dev 
 ***********************************************************************************************************************************************************************************/

//Import das bibliotecas para criar a API 
const express = require('express')
const cors = require('cors')
const bodyParser = require('body-parser')
const PDFDocument = require('pdfkit')
const multer = require('multer')
const mammoth = require('mammoth')
const fs = require('fs')
const path = require('path')
const docxConverter = require('docx-pdf')
const { PDFDocument: PDFLib, rgb } = require('pdf-lib')
const pdf2pic = require('pdf-poppler')

//criando o formato de dados que sera recebido no body da requisição (post/put)
const bodyParserJSON = bodyParser.json({ limit: '1gb' })

// Armazenar dados das assinaturas temporariamente
let processedDocuments = new Map()

// Configurar multer para upload de arquivos
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '..', 'temp')
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true })
        }
        cb(null, uploadDir)
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`)
    }
})

const upload = multer({ 
    storage: storage,
    fileFilter: (req, file, cb) => {
        const allowedMimes = [
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
            'application/msword' // .doc
        ]
        
        if (allowedMimes.includes(file.mimetype)) {
            cb(null, true)
        } else {
            cb(new Error('Apenas arquivos .doc e .docx são permitidos'), false)
        }
    }
})

//Cria o objeto app para criar a API
const app = express()

// Configurar limite de tamanho para arquivos grandes
app.use(express.json({ limit: '1gb' }))
app.use(express.urlencoded({ limit: '1gb', extended: true }))

app.use((request, response, next)=>{
    response.header('Access-Control-Allow-Origin', '*')
    response.header('Access-Control-Allow-Methods', 'GET, POST,PUT DELETE, OPTIONS')

    app.use(cors())
    next()

})

// Endpoint de teste GET
app.get('/api/test', cors(), function (request, response) {
    response.status(200)
    response.json({ 
        message: 'API funcionando!',
        timestamp: new Date().toISOString(),
        endpoints: {
            test: 'GET /api/test',
            upload: 'POST /api/upload',
            user: 'POST /api/user'
        }
    })
})

// Novo endpoint para upload de arquivo real com assinatura
app.post('/api/upload-file', cors(), upload.single('document'), async function (request, response) {
    try {
        if (!request.file) {
            return response.status(400).json({ error: 'Arquivo .doc ou .docx é obrigatório' })
        }
        
        const { signature, positionX, positionY, signatureWidth, signatureHeight } = request.body
        
        if (!signature) {
            return response.status(400).json({ error: 'Assinatura é obrigatória' })
        }
        
        // Processar arquivo DOC/DOCX
        const filePath = request.file.path
        const fileName = request.file.originalname
        const pdfPath = filePath.replace(/\.(docx?|DOC|DOCX)$/i, '.pdf')
        
        // Converter DOCX para PDF preservando formatação
        await new Promise((resolve, reject) => {
            docxConverter(filePath, pdfPath, (err, result) => {
                if (err) reject(err)
                else resolve(result)
            })
        })
        
        // Ler PDF original
        const originalPdfBytes = fs.readFileSync(pdfPath)
        
        // Usar coordenadas precisas enviadas pelo frontend
        const signaturePos = {
            x: parseFloat(positionX) || 300.0,
            y: parseFloat(positionY) || 400.0
        }
        
        // Armazenar dados para download
        processedDocuments.set(fileName, {
            nome: fileName,
            originalPdfBytes: originalPdfBytes,
            signatures: [{
                imageData: signature,
                posicao: signaturePos,
                dimensoes: { 
                    largura: parseFloat(signatureWidth) || 150.0, 
                    altura: parseFloat(signatureHeight) || 50.0 
                }
            }],
            processedAt: new Date()
        })
        
        // Limpar arquivos temporários
        fs.unlinkSync(filePath)
        fs.unlinkSync(pdfPath)
        
        response.status(200).json({
            message: 'Documento processado com sucesso',
            documento: {
                nome: fileName,
                arquivo_final: fileName.replace(/\.(docx?|DOC|DOCX)$/i, '_assinado.pdf'),
                status: 'processado'
            },
            timestamp: new Date().toISOString()
        })
        
    } catch (error) {
        console.error('Erro no processamento:', error)
        response.status(500).json({ 
            error: 'Erro interno do servidor',
            message: error.message 
        })
    }
})

//Endpoint para upload e assinatura de múltiplos documentos (mantido para compatibilidade)
app.post('/api/upload', cors(), bodyParserJSON, async function (request, response) {
    
    try {
        const { documents, signatures } = request.body
        
        // Validações
        if (!documents || !Array.isArray(documents)) {
            return response.status(400).json({ error: 'Array de documentos é obrigatório' })
        }
        
        if (!signatures || !Array.isArray(signatures)) {
            return response.status(400).json({ error: 'Array de assinaturas é obrigatório' })
        }
        
        // Validar cada assinatura
        for (let i = 0; i < signatures.length; i++) {
            const sig = signatures[i]
            
            if (!sig.imageData) {
                return response.status(400).json({ error: `Imagem da assinatura ${i + 1} é obrigatória` })
            }
            
            if (!sig.page || sig.page < 1) {
                return response.status(400).json({ error: `Número da página da assinatura ${i + 1} é obrigatório` })
            }
            
            if (!sig.position || !sig.position.x || !sig.position.y) {
                return response.status(400).json({ error: `Posição da assinatura ${i + 1} (x, y) é obrigatória` })
            }
            
            const isValidImage = sig.imageData.startsWith('data:image/jpeg') || 
                               sig.imageData.startsWith('data:image/png') ||
                               sig.imageData.startsWith('data:image/jpg')
            
            if (!isValidImage) {
                return response.status(400).json({ error: `Formato de imagem inválido na assinatura ${i + 1}. Use JPEG ou PNG` })
            }
        }
        
        // Processar documentos
        const resultados = documents.map((doc, index) => {
            const docSignatures = signatures.map(sig => ({
                pagina: sig.page,
                posicao: {
                    x: sig.position.x,
                    y: sig.position.y
                },
                dimensoes: {
                    largura: sig.width || 150,
                    altura: sig.height || 50
                },
                tipo: sig.imageData.includes('jpeg') ? 'JPEG' : 'PNG',
                imageData: sig.imageData
            }))
            
            const docName = doc.nome || `documento_${index + 1}.docx`
            
            // Armazenar dados para download posterior
            processedDocuments.set(docName, {
                nome: docName,
                signatures: docSignatures,
                processedAt: new Date()
            })
            
            return {
                index: index + 1,
                nome: docName,
                tamanho: doc.tamanho || 'N/A',
                total_paginas: doc.totalPages || 'N/A',
                status: 'processado',
                arquivo_final: `${docName}_assinado.pdf`,
                assinaturas_aplicadas: docSignatures.map(s => ({
                    pagina: s.pagina,
                    posicao: s.posicao,
                    dimensoes: s.dimensoes,
                    tipo: s.tipo
                }))
            }
        })
        
        response.status(200).json({
            message: `${documents.length} documentos processados com ${signatures.length} assinaturas cada`,
            total_documentos: documents.length,
            total_assinaturas_por_documento: signatures.length,
            configuracao_assinaturas: signatures.map((sig, i) => ({
                assinatura: i + 1,
                pagina: sig.page,
                posicao: sig.position,
                dimensoes: {
                    largura: sig.width || 150,
                    altura: sig.height || 50
                }
            })),
            documentos: resultados,
            timestamp: new Date().toISOString()
        })
        
    } catch (error) {
        response.status(500).json({ 
            error: 'Erro interno do servidor',
            message: error.message 
        })
    }
    
})

// Endpoint de teste para criar usuário (sem banco)
app.post('/api/user', cors(), bodyParserJSON, function (request, response) {
    
    let dadosBody = request.body
    
    response.status(201)
    response.json({
        message: 'Usuário criado com sucesso (simulado)',
        user: {
            id: Math.floor(Math.random() * 1000),
            ...dadosBody,
            createdAt: new Date().toISOString()
        }
    })
})

// Endpoint para preview do documento
app.post('/api/preview', cors(), upload.single('document'), async function (request, response) {
    try {
        if (!request.file) {
            return response.status(400).json({ error: 'Arquivo .doc ou .docx é obrigatório' })
        }
        
        const fileName = request.file.originalname
        
        console.log('Preview para:', fileName)
        
        // Tamanho padrão para documentos oficiais A4
        const signatureSize = {
            width: 148,
            height: 33
        }
        
        // HTML simples simulando documento oficial
        const htmlContent = `
            <div style="font-family: Times, serif; font-size: 11px; line-height: 1.2; padding: 20px;">
                <div style="text-align: center; margin-bottom: 20px;">
                    <strong>DOCUMENTO OFICIAL</strong>
                </div>
                <p>Documento: ${fileName}</p>
                <p>Este é um preview simplificado do documento.</p>
                <p>Clique onde deseja posicionar a assinatura.</p>
                <br><br>
                <p>_________________________________</p>
                <p style="text-align: center;">Assinatura 1</p>
                <br>
                <p>_________________________________</p>
                <p style="text-align: center;">Assinatura 2</p>
            </div>
        `
        
        // Limpar arquivo temporário
        if (fs.existsSync(request.file.path)) {
            fs.unlinkSync(request.file.path)
        }
        
        response.status(200).json({
            fileName: fileName,
            htmlContent: htmlContent,
            recommendedSize: signatureSize,
            message: 'Preview gerado com sucesso'
        })
        
    } catch (error) {
        console.error('Erro no preview:', error)
        response.status(500).json({ 
            error: 'Erro ao gerar preview',
            message: error.message 
        })
    }
})

// Endpoint para listar usuários (dados fictícios)
app.get('/api/users', cors(), function (request, response) {
    
    const users = [
        { id: 1, nome: 'João', email: 'joao@email.com' },
        { id: 2, nome: 'Maria', email: 'maria@email.com' },
        { id: 3, nome: 'Pedro', email: 'pedro@email.com' }
    ]
    
    response.status(200)
    response.json({
        message: 'Lista de usuários',
        total: users.length,
        users: users
    })
})

// Endpoint para download de documentos processados
app.get('/api/download/:fileName', cors(), async function (request, response) {
    try {
        const fileName = decodeURIComponent(request.params.fileName)
        const pdfFileName = fileName.replace(/\.(docx?|DOC|DOCX)$/i, '_assinado.pdf')
        
        // Buscar dados do documento processado
        const docData = processedDocuments.get(fileName)
        
        if (!docData) {
            return response.status(404).json({ error: 'Documento não encontrado' })
        }
        
        // Usar PDF original e adicionar assinatura
        const pdfDoc = await PDFLib.load(docData.originalPdfBytes)
        const pages = pdfDoc.getPages()
        const firstPage = pages[0]
        
        // Adicionar assinaturas nas posições especificadas
        for (const sig of docData.signatures) {
            try {
                console.log('Processando assinatura:', sig)
                
                // Converter base64 para buffer
                const base64Data = sig.imageData.replace(/^data:image\/[a-z]+;base64,/, '')
                const imageBytes = Buffer.from(base64Data, 'base64')
                
                // Incorporar imagem no PDF
                let image
                if (sig.imageData.includes('png')) {
                    image = await pdfDoc.embedPng(imageBytes)
                } else {
                    image = await pdfDoc.embedJpg(imageBytes)
                }
                
                // Obter dimensões da página
                const { width, height } = firstPage.getSize()
                console.log('Dimensões da página:', { width, height })
                
                // Coordenadas precisas (PDF usa origem no canto inferior esquerdo)
                // Ajustar para coordenadas exatas do frontend
                const x = parseFloat(sig.posicao.x)
                const y = parseFloat(height - sig.posicao.y - sig.dimensoes.altura)
                const w = parseFloat(sig.dimensoes.largura)
                const h = parseFloat(sig.dimensoes.altura)
                
                console.log('Coordenadas precisas:', { x, y, width: w, height: h, pageHeight: height })
                
                // Adicionar imagem da assinatura com precisão
                firstPage.drawImage(image, {
                    x: x,
                    y: y,
                    width: w,
                    height: h,
                    opacity: 1.0
                })
                
                console.log('Assinatura adicionada com sucesso!')
                
            } catch (imgError) {
                console.error('Erro ao adicionar assinatura:', imgError)
                
                // Fallback: adicionar retângulo vermelho para debug
                const { height } = firstPage.getSize()
                firstPage.drawRectangle({
                    x: sig.posicao.x,
                    y: height - sig.posicao.y - sig.dimensoes.altura,
                    width: sig.dimensoes.largura,
                    height: sig.dimensoes.altura,
                    borderColor: rgb(1, 0, 0),
                    borderWidth: 2
                })
            }
        }
        
        // Gerar PDF final
        const pdfBytes = await pdfDoc.save()
        
        response.setHeader('Content-Type', 'application/pdf')
        response.setHeader('Content-Disposition', `attachment; filename="${pdfFileName}"`)
        
        response.status(200)
        response.send(Buffer.from(pdfBytes))
        
    } catch (error) {
        console.error('Erro no download:', error)
        response.status(500).json({ 
            error: 'Erro ao gerar download',
            message: error.message 
        })
    }
})

app.listen(3001, function(){
    console.log('Servidor aguardando novas requisições na porta 3001...')
    console.log('Acesse: http://localhost:3001/api/test')
})