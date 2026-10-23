/**
 * Exportação da lista de usuários em PDF (tela Controle de Acesso).
 *
 * As bibliotecas são carregadas só quando alguém pede o PDF, para não pesar na abertura da tela.
 */
import { CABECALHO_EXPORTACAO, formatarDataHora, linhasExportacao } from './usuariosCsv'

const TITULOS = {
  login: 'Login',
  nome: 'Nome',
  sobrenome: 'Sobrenome',
  email: 'E-mail',
  ativo: 'Ativo',
  perfis: 'Perfis',
  permissoes_avulsas: 'Permissões avulsas',
  permissoes_efetivas: 'Permissões efetivas',
  criado_em: 'Inserção',
}

export async function gerarPdfUsuarios(usuarios, nomeDoPerfil, geradoEm = new Date()) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })

  doc.setFontSize(14)
  doc.text('DataGIS — Controle de Acesso', 40, 40)
  doc.setFontSize(9)
  doc.setTextColor(100)
  doc.text(`Gerado em ${formatarDataHora(geradoEm)} · ${usuarios.length} usuário(s)`, 40, 56)

  autoTable(doc, {
    startY: 70,
    head: [CABECALHO_EXPORTACAO.map((c) => TITULOS[c])],
    body: linhasExportacao(usuarios, nomeDoPerfil),
    styles: { fontSize: 7.5, cellPadding: 4, overflow: 'linebreak', valign: 'top' },
    headStyles: { fillColor: [21, 128, 61], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [241, 245, 249] },
    columnStyles: { 6: { cellWidth: 190 } },
    margin: { left: 40, right: 40 },
    didDrawPage: () => {
      const pagina = doc.getNumberOfPages()
      doc.setFontSize(8)
      doc.setTextColor(120)
      doc.text(`Página ${pagina}`, doc.internal.pageSize.getWidth() - 80, doc.internal.pageSize.getHeight() - 20)
    },
  })
  return doc
}
