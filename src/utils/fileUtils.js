const fs = require('fs-extra');
const path = require('path');

class FileUtils {
  
  /**
   * Lê um arquivo e retorna seu conteúdo como Buffer
   * @param {string} filePath - Caminho do arquivo
   * @returns {Buffer} - Conteúdo do arquivo
   */
  async readFile(filePath) {
    try {
      return await fs.readFile(filePath);
    } catch (error) {
      throw new Error(`Erro ao ler arquivo ${filePath}: ${error.message}`);
    }
  }

  /**
   * Remove arquivos temporários
   * @param {string[]} filePaths - Array com caminhos dos arquivos para remover
   */
  async cleanupFiles(filePaths) {
    const cleanupPromises = filePaths.map(async (filePath) => {
      try {
        if (await fs.pathExists(filePath)) {
          await fs.remove(filePath);
          console.log(`Arquivo removido: ${path.basename(filePath)}`);
        }
      } catch (error) {
        console.warn(`Aviso: Não foi possível remover ${filePath}:`, error.message);
      }
    });

    await Promise.all(cleanupPromises);
  }

  /**
   * Gera nome único para arquivo
   * @param {string} extension - Extensão do arquivo (com ponto)
   * @returns {string} - Nome único do arquivo
   */
  generateUniqueFilename(extension = '') {
    const timestamp = Date.now();
    const random = Math.round(Math.random() * 1E9);
    return `${timestamp}-${random}${extension}`;
  }

  /**
   * Valida se o arquivo existe
   * @param {string} filePath - Caminho do arquivo
   * @returns {boolean} - True se existe, false caso contrário
   */
  async fileExists(filePath) {
    try {
      return await fs.pathExists(filePath);
    } catch (error) {
      return false;
    }
  }

  /**
   * Obtém informações do arquivo
   * @param {string} filePath - Caminho do arquivo
   * @returns {object} - Informações do arquivo
   */
  async getFileInfo(filePath) {
    try {
      const stats = await fs.stat(filePath);
      return {
        size: stats.size,
        created: stats.birthtime,
        modified: stats.mtime,
        isFile: stats.isFile(),
        isDirectory: stats.isDirectory()
      };
    } catch (error) {
      throw new Error(`Erro ao obter informações do arquivo: ${error.message}`);
    }
  }
}

module.exports = new FileUtils();