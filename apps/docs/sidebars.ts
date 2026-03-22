import type {SidebarsConfig} from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docsSidebar: [
    'intro',
    {
      type: 'category',
      label: 'How It Works',
      items: [
        'how-it-works/signing-flow',
        'how-it-works/verification-flow',
        'how-it-works/encryption',
      ],
    },
    {
      type: 'category',
      label: 'Trust Model',
      items: [
        'trust-model/overview',
        'trust-model/threat-model',
        'trust-model/guarantees',
      ],
    },
    {
      type: 'category',
      label: 'Architecture',
      items: [
        'architecture/overview',
        'architecture/desktop-app',
        'architecture/api-server',
        'architecture/smart-contract',
        'architecture/verification-web',
      ],
    },
    {
      type: 'category',
      label: 'Technical Reference',
      items: [
        'reference/qr-code',
        'reference/pdf-embedding',
        'reference/data-formats',
      ],
    },
  ],
};

export default sidebars;
