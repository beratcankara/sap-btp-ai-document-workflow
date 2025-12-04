namespace ai.doc;

using { cuid, managed } from '@sap/cds/common';

entity Documents : cuid, managed {
  title       : String(255);
  description : String;
  contentUrl  : String;
  status      : String(30) default 'NEW';
}
