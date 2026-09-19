/** When editing branches, sync: `api/branchKnowledge.ts`, Spring `ai/ashcol-branches-prompt.txt` (content matches ashcolBranchKnowledge). */
export type PublicBranch = {
  name: string
  tag: string
  color: string
  address: string
  phones: string[]
  email: string
  mapUrl: string
  landline?: string
  isHQ?: boolean
  region?: string
  isFranchise?: boolean
}

export const PUBLIC_BRANCHES: PublicBranch[] = [
  {
    name: 'Head Office',
    tag: 'Taguig',
    color: '#10B981',
    address: 'Unit 2A & 2B, 2/F Genesis Bldg., 182-A 19th Ave., East Rembo, Taguig',
    phones: ['0917 828 5595', '0917 506 2090', '0998 566 4801', '7729 1293'],
    email: 'headoffice@ashcol.com.ph',
    mapUrl: 'https://maps.app.goo.gl/pPJhEaXBEtxjbNN29',
    isHQ: true,
    region: 'Metro Manila',
  },
  {
    name: 'ASHCOL Valenzuela',
    tag: 'Valenzuela',
    color: '#6366F1',
    address: '0147 M.H. Del Pilar St., Arkong Bato, District 1, Valenzuela City',
    phones: ['0943 358 4220', '0905 420 1556'],
    email: 'ashcolnorth@ashcol.com.ph',
    mapUrl: '',
    region: 'Metro Manila',
    isFranchise: true,
  },
  {
    name: 'ASHCOL Bulacan',
    tag: 'Bulacan',
    color: '#F59E0B',
    address: 'Ground Floor, RME Building, Salangan, San Miguel, Bulacan',
    phones: ['0917 506 2090', '0939 973 3163'],
    email: 'ashcolbulacan@gmail.com',
    mapUrl: '',
    region: 'Bulacan',
  },
  {
    name: 'ASHCOL Pampanga',
    tag: 'Pampanga',
    color: '#14B8A6',
    address: 'Unit 202, CitiCorp Building, Brgy. San Isidro, City of San Fernando, Pampanga',
    phones: ['0917 103 8743'],
    landline: '045 300 8533',
    email: 'ashcolpampanga@ashcol.com.ph',
    mapUrl: '',
    region: 'Pampanga',
  },
  {
    name: 'ASHCOL Rizal',
    tag: 'Rizal',
    color: '#F97316',
    address: '2nd Flr Norika Bldg #70 E. Rodriguez Sr., San Jose Hi-way, Rodriguez, Rizal',
    phones: ['0917 682 8328', '0920 923 2071'],
    email: 'ashcolrodriguezrizal@gmail.com',
    mapUrl: '',
    region: 'Rizal',
  },
  {
    name: 'ASHCOL Laguna',
    tag: 'Laguna',
    color: '#8B5CF6',
    address: 'Purok 4, Kalye Pogi, Bangyas, Calauan, Laguna',
    phones: ['0999 990 5224', '0949 994 3299'],
    email: 'ashcolcalauan@gmail.com',
    mapUrl: '',
    region: 'Laguna',
  },
  {
    name: 'ASHCOL Batangas',
    tag: 'Batangas',
    color: '#3B82F6',
    address: 'Ground Floor, BMI Building, 12 Laguile, Taal, Batangas',
    phones: ['0998 999 3041', '0919 005 9032'],
    email: 'ashcolbatangas@ashcol.com.ph',
    mapUrl: '',
    region: 'Batangas',
    isFranchise: true,
  },
  {
    name: 'ASHCOL Gen. Trias',
    tag: 'Gen. Trias, Cavite',
    color: '#A855F7',
    address: 'Blk 9 Lot 16, South Square Village, Pasong Kawayan II, General Trias, Cavite',
    phones: ['0995 014 6891', '0949 307 1625'],
    email: 'ashcolcavite@ashcol.com.ph',
    mapUrl: '',
    region: 'Cavite',
    isFranchise: true,
  },
  {
    name: 'ASHCOL Candelaria',
    tag: 'Quezon',
    color: '#EF4444',
    address: 'Maharlika Highway, Malabanban Norte, Candelaria, Quezon Province',
    phones: ['0917 159 6995', '0947 993 9208'],
    email: 'ashcolcandelaria@gmail.com',
    mapUrl: '',
    region: 'Quezon',
  },
  {
    name: 'ASHCOL Dasmariñas',
    tag: 'Dasmarinas, Cavite',
    color: '#06B6D4',
    address: "2/F Unit 5, Blk 94 Lot 5 & 6, Governor's Drive, Metro Gate Subd., San Agustin 1, City of Dasmarinas, Cavite",
    phones: ['0917 505 4925', '0949 994 3299'],
    landline: '046 413 1726',
    email: 'ashcoldasma@gmail.com',
    mapUrl: '',
    region: 'Cavite',
  },
  {
    name: 'ASHCOL Silang',
    tag: 'Silang, Cavite',
    color: '#EC4899',
    address: '2nd Floor, Rheayanelle Building, 9015 Pandan St., Brgy. Puting Kahoy, Sta. Rosa Tagaytay Road, Silang, Cavite',
    phones: ['0998 577 0421', '0917 714 3810', '0917 505 4925'],
    email: 'ashcolsouth@ashcol.com.ph',
    mapUrl: '',
    region: 'Cavite',
  },
  {
    name: 'ASHCOL San Pedro',
    tag: 'San Pedro, Laguna',
    color: '#0D9488',
    address: 'National Highway, Brgy. Landayan, San Pedro City, Laguna',
    phones: ['0999 990 5224'],
    email: 'ashcolsanpedro@gmail.com',
    mapUrl: '',
    region: 'Laguna',
  },
]
