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

entity DocumentAnalyses : cuid, managed {
  document         : Association to Documents;
  prompt           : LargeString;
  response         : LargeString;
  amount           : Decimal(15, 2);
  vendor           : String(255);
  date             : Date;
  riskLevel        : String(30);
  confidence       : Decimal(5, 2);
  feedbackRequired : Boolean default false;
  feedbackProvided : Boolean default false;
  workflowInstanceId : String(255);
  workflowStatus     : String(60);
}

entity DocumentFeedback : cuid, managed {
  analysis   : Association to DocumentAnalyses;
  corrections: LargeString;
  comments   : String;
  submittedBy: String;
}
