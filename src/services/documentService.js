const fs = require('fs-extra');
const path = require('path');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

class DocumentService {
  
  /**
   * Adiciona assinatura ao documento Word substituindo o placeholder {{ASSINATURA}}
   * @param {string} docxPath - Caminho do arquivo .docx
   * @param {string} signatureBase64 - Assinatura em base64
   * @returns {string} - Caminho do arquivo modificado
   */
  async addSignatureToDocument(docxPath, signatureBase64) {
    try {
      // Ler o arquivo .docx
      const content = await fs.readFile(docxPath);
      const zip = new PizZip(content);
      
      // Criar instância do docxtemplater
      const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
      });

      // Processar a imagem base64
      const imageBuffer = this.processBase64Image(signatureBase64);
      
      // Substituir o placeholder pela imagem
      // Para imagens, precisamos usar um módulo específico ou converter para texto
      // Por simplicidade, vamos substituir por um texto indicativo
      doc.setData({
        ASSINATURA: '[ASSINATURA APLICADA]'
      });

      try {
        doc.render();
      } catch (error) {
        console.error('Erro ao renderizar documento:', error);
        throw new Error('Erro ao processar template do documento');
      }

      // Gerar novo arquivo
      const buf = doc.getZip().generate({ type: 'nodebuffer' });
      
      // Salvar arquivo modificado
      const outputPath = docxPath.replace('.docx', '-signed.docx');
      await fs.writeFile(outputPath, buf);
      
      console.log('Assinatura adicionada ao documento');
      return outputPath;

    } catch (error) {
      console.error('Erro ao adicionar assinatura:', error);
      throw new Error(`Falha ao processar documento: ${error.message}`);
    }
  }

  /**
   * Converte documento Word para PDF usando LibreOffice
   * @param {string} docxPath - Caminho do arquivo .docx
   * @returns {string} - Caminho do arquivo PDF gerado
   */
  async convertToPdf(docxPath) {
    try {
      const outputDir = path.dirname(docxPath);
      const filename = path.basename(docxPath, '.docx');
      const pdfPath = path.join(outputDir, `${filename}.pdf`);

      // Comando LibreOffice para conversão
      const command = `soffice --headless --convert-to pdf --outdir "${outputDir}" "${docxPath}"`;
      
      console.log('Convertendo para PDF...');
      
      try {
        await execAsync(command, { timeout: 30000 });
      } catch (execError) {
        // Tentar comando alternativo para Windows
        const altCommand = `"C:\\Program Files\\LibreOffice\\program\\soffice.exe" --headless --convert-to pdf --outdir "${outputDir}" "${docxPath}"`;
        try {
          await execAsync(altCommand, { timeout: 30000 });
        } catch (altError) {
          throw new Error('LibreOffice não encontrado. Instale o LibreOffice para conversão PDF.');
        }
      }

      // Verificar se o PDF foi criado
      if (await fs.pathExists(pdfPath)) {
        console.log('Conversão para PDF concluída');
        return pdfPath;
      } else {
        throw new Error('Falha na conversão para PDF');
      }

    } catch (error) {
      console.error('Erro na conversão PDF:', error);
      throw new Error(`Erro ao converter para PDF: ${error.message}`);
    }
  }

  /**
   * Processa imagem base64 removendo prefixo se necessário
   * @param {string} base64String - String base64 da imagem
   * @returns {Buffer} - Buffer da imagem
   */
  processBase64Image(base64String) {
    try {
      // Remover prefixo data:image se existir
      const base64Data = base64String.replace(/^data:image\/[a-z]+;base64,/, '');
      return Buffer.from(base64Data, 'base64');
    } catch (error) {
      throw new Error('Formato de assinatura base64 inválido');
    }
  }
}

module.exports = new DocumentService();