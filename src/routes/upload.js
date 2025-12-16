const express = require('express');
const multer = require('multer');
const path = require('path');
const documentService = require('../services/documentService');
const fileUtils = require('../utils/fileUtils');

const router = express.Router();

// Configuração do multer para upload de arquivos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const tempDir = path.join(__dirname, '..', '..', 'temp');
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1E9)}.docx`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    // Aceitar apenas arquivos .docx
    if (file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      cb(null, true);
    } else {
      cb(new Error('Apenas arquivos .docx são permitidos'), false);
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  }
});

// Rota principal para upload e processamento
router.post('/upload', upload.single('document'), async (req, res) => {
  let tempFiles = [];
  
  try {
    // Validar se o arquivo foi enviado
    if (!req.file) {
      return res.status(400).json({ error: 'Arquivo .docx é obrigatório' });
    }

    // Validar se a assinatura foi enviada
    if (!req.body.signature) {
      return res.status(400).json({ error: 'Assinatura em base64 é obrigatória' });
    }

    const docxPath = req.file.path;
    tempFiles.push(docxPath);

    console.log('Processando documento:', req.file.filename);

    // Processar o documento com a assinatura
    const signedDocxPath = await documentService.addSignatureToDocument(
      docxPath, 
      req.body.signature
    );
    tempFiles.push(signedDocxPath);

    // Converter para PDF
    const pdfPath = await documentService.convertToPdf(signedDocxPath);
    tempFiles.push(pdfPath);

    // Enviar o PDF como resposta
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="documento-assinado.pdf"');
    
    const pdfBuffer = await fileUtils.readFile(pdfPath);
    res.send(pdfBuffer);

    console.log('Documento processado com sucesso');

  } catch (error) {
    console.error('Erro no processamento:', error);
    res.status(500).json({ 
      error: 'Erro ao processar documento',
      message: error.message 
    });
  } finally {
    // Limpar arquivos temporários
    await fileUtils.cleanupFiles(tempFiles);
  }
})

module.exports = router;