declare module "pdf-parse" {
  interface PDFTextItem {
    str: string;
  }
  interface PDFTextContent {
    items: PDFTextItem[];
  }
  interface PDFPageProxy {
    getTextContent: () => Promise<PDFTextContent>;
  }
  interface PDFParseOptions {
    pagerender?: (pageData: PDFPageProxy) => Promise<string> | string;
    max?: number;
  }
  interface PDFParseResult {
    numpages: number;
    numrender: number;
    text: string;
    info: unknown;
    metadata: unknown;
    version: string;
  }
  function pdfParse(dataBuffer: Buffer, options?: PDFParseOptions): Promise<PDFParseResult>;
  export = pdfParse;
}
