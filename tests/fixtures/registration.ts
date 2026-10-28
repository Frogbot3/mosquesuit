import { blankMember, todayInIndia, type FamilyDraft } from '../../shared/registration';

export function fictionalFamily(number = '001', wardId = 'ward-1'): FamilyDraft {
  const guardian = { ...blankMember(true), name: 'Fictional Ameen', nameMl: 'മാതൃകാ അമീൻ', gender: 'male' as const, phone: '9000000001' };
  return {
    id: null, revision: 0, wardId, familyNumber: number, houseName: 'Fictional Green House', houseNameMl: 'മാതൃകാ വീട്',
    houseNumber: '12A', address: 'Fictional Lane', locality: 'Demo locality', postalCode: '670001', email: '',
    registrationDate: todayInIndia(), notes: 'Fictional test fixture only', status: 'draft', guardianKey: guardian.clientKey,
    members: [guardian,
      { ...blankMember(), name: 'Fictional Safiya', nameMl: 'മാതൃകാ സഫിയ', gender: 'female', relationship: 'spouse', dob: '1990-05-10' },
      { ...blankMember(), name: 'Fictional Yusuf', gender: 'male', relationship: 'son', dob: '2015-06-15' },
      { ...blankMember(), name: 'Fictional Mariam', gender: 'female', relationship: 'daughter', dob: '2018-08-20' },
    ],
  };
}
