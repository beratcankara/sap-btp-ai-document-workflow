using { ai.doc as doc } from '../db/schema';

service DocumentService {
  @restrict: [
    { grant: 'READ', to: 'Viewer' },
    { grant: ['READ', 'CREATE', 'UPDATE', 'DELETE'], to: 'Uploader' }
  ]
  entity Documents as projection on doc.Documents;
}
