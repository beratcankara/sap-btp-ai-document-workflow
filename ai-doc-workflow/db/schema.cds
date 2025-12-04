namespace ai.doc;

using { cuid, managed } from '@sap/cds/common';

entity Documents : cuid, managed {
  title       : String(255);
  description : String;
  fileName    : String(255);
  mimeType    : String(100);
  fileSize    : Integer;
  contentUrl  : String;
  extractedText : LargeString;
  status      : String(30) default 'NEW';
}
