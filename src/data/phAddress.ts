// Philippine address data — NCR cities/municipalities with their barangays
// Focused on Ashcol's service areas

export interface City { name: string; barangays: string[] }
export interface Province { name: string; cities: City[] }
export interface Region { name: string; provinces: Province[] }

export const PH_REGIONS: Region[] = [
  {
    name: 'NCR – Metro Manila',
    provinces: [
      {
        name: 'Metro Manila',
        cities: [
          { name: 'Caloocan', barangays: ['Bagong Silang','Baesa','Bagumbong','Camarin','Deparo','Grace Park East','Grace Park West','Kaunlaran','Maypajo','Monumento','Novaliches','Pag-asa','Sangandaan','Tala','Tinajeros','University Hills'] },
          { name: 'Las Piñas', barangays: ['Almanza Dos','Almanza Uno','BF Resort','Daniel Fajardo','Elias Aldana','Ilaya','Manuyo Dos','Manuyo Uno','Pamplona Dos','Pamplona Tres','Pamplona Uno','Pilar','Pulang Lupa Dos','Pulang Lupa Uno','Talon Dos','Talon Kuatro','Talon Singko','Talon Tres','Talon Uno','Zapote'] },
          { name: 'Makati', barangays: ['Bangkal','Bel-Air','Carmona','Cembo','Comembo','Dasmariñas','East Rembo','Forbes Park','Guadalupe Nuevo','Guadalupe Viejo','Kasilawan','La Paz','Magallanes','Olympia','Palanan','Pembo','Pinagkaisahan','Pio del Pilar','Pitogo','Poblacion','Post Proper Northside','Post Proper Southside','Rizal','San Antonio','San Isidro','San Lorenzo','Santa Cruz','Singkamas','South Cembo','Tejeros','Urdaneta','Valenzuela','West Rembo'] },
          { name: 'Malabon', barangays: ['Acacia','Baritan','Bayan-bayanan','Catmon','Concepcion','Dampalit','Flores','Hulong Duhat','Ibaba','Longos','Maysilo','Muzon','Niugan','Panghulo','Potrero','San Agustin','San Jose','Santolan','Tañong','Tinajeros','Tonsuya','Tugatog'] },
          { name: 'Mandaluyong', barangays: ['Addition Hills','Bagong Silang','Barangka Drive','Barangka Ibaba','Barangka Ilaya','Barangka Itaas','Buayang Bato','Burol','Daang Bakal','Hagdang Bato Itaas','Hagdang Bato Libis','Harapin ang Bukas','Highway Hills','Hulo','Mabini-J. Rizal','Malamig','Mandaluyong','Mauway','Namayan','New Zañiga','Old Zañiga','Pag-asa','Plainview','Pleasant Hills','Poblacion','San Jose','Vergara','Wack-Wack Greenhills'] },
          { name: 'Manila', barangays: ['Binondo','Ermita','Intramuros','Malate','Paco','Pandacan','Port Area','Quiapo','Sampaloc','San Andres','San Miguel','San Nicolas','Santa Ana','Santa Cruz','Santa Mesa','Tondo'] },
          { name: 'Marikina', barangays: ['Barangka','Calumpang','Concepcion Dos','Concepcion Uno','Fortune','Industrial Valley','Jesus dela Peña','Kalumpang','Malanday','Nangka','Parang','San Roque','Santa Elena','Santo Niño','Tañong','Tumana'] },
          { name: 'Muntinlupa', barangays: ['Alabang','Ayala Alabang','Bayanan','Buli','Cupang','Poblacion','Putatan','Sucat','Tunasan'] },
          { name: 'Navotas', barangays: ['Bagumbayan North','Bagumbayan South','Bangculasi','Daanghari','Navotas East','Navotas West','North Bay Blvd. North','North Bay Blvd. South','San Jose (Baltao)','San Roque','Sipac-Almacen','Tangos North','Tangos South'] },
          { name: 'Parañaque', barangays: ['BF Homes','Don Bosco','Don Galo','La Huerta','Marcelo Green','Merville','Moonshine','San Antonio','San Dionisio','San Isidro','San Martin de Porres','Santo Niño','Sun Valley','Tambo','Vitalez'] },
          { name: 'Pasay', barangays: ['Baclaran','Don Bosco','Libertad','Malibay','Maricaban','Pasay Proper','San Jose','San Rafael','Santa Clara','Villamor'] },
          { name: 'Pasig', barangays: ['Bagong Ilog','Bagong Katipunan','Bambang','Buting','Caniogan','Dela Paz','Kalawaan','Kapasigan','Kapitolyo','Malinao','Manggahan','Maybunga','Oranbo','Palatiw','Pinagbuhatan','Pineda','Rosario','Sagad','San Antonio','San Joaquin','San Jose','San Nicolas','Santa Cruz','Santa Lucia','Santa Rosa','Santo Tomas','Santolan','Sumilang','Ugong'] },
          { name: 'Pateros', barangays: ['Aguho','Magtanggol','Martires del 96','Poblacion','San Pedro','San Roque','Santa Ana','Santo Rosario-Kanluran','Santo Rosario-Silangan','Tabacalera'] },
          { name: 'Quezon City', barangays: ['Alicia','Amihan','Apolonio Samson','Aurora','Baesa','Bagbag','Bagong Lipunan ng Crame','Bagong Pag-asa','Bagong Silangan','Bagumbayan','Bagumbuhay','Bahay Toro','Balingasa','Batasan Hills','Botocan','Bungad','Camp Aguinaldo','Capri','Claro','Commonwealth','Culiat','Damar','Damayan','Damayan Lagi','Del Monte','Dioquino Zobel','Don Manuel','Doña Aurora','Doña Imelda','Doña Josefa','Duyan-Duyan','E. Rodriguez','East Kamias','Escopa I','Escopa II','Escopa III','Escopa IV','Fairview','Greater Lagro','Gulod','Holy Spirit','Horseshoe','Immaculate Concepcion','Kaligayahan','Kalusugan','Kamuning','Katipunan','Kaunlaran','Kristong Hari','Krus na Ligas','Laging Handa','Libis','Lourdes','Loyola Heights','Maharlika','Malaya','Manresa','Mariana','Mariblo','Marilag','Masagana','Masambong','Matandang Balara','Milagrosa','New Era','Novaliches Proper','Obrero','Old Capitol Site','Pag-ibig sa Nayon','Paligsahan','Paltok','Pansol','Paraiso','Pasong Putik','Payatas','Phil-Am','Pinagkaisahan','Pinyahan','Project 6','Quirino 2-A','Quirino 2-B','Quirino 2-C','Quirino 3-A','Ramon Magsaysay','Roxas','Sacred Heart','Saint Ignatius','Saint Peter','Salvacion','San Agustin','San Antonio','San Bartolome','San Isidro Labrador','San Jose','San Martin de Porres','San Roque','Sangandaan','Santa Cruz','Santa Lucia','Santa Monica','Santo Cristo','Santo Domingo','Santol','Sauyo','Siena','Sikatuna Village','Silangan','Socorro','South Triangle','Tagumpay','Talayan','Talipapa','Tandang Sora','Tatalon','Teachers Village East','Teachers Village West','U.P. Campus','U.P. Village','Ugong Norte','Unang Sigaw','Valencia','Vasra','Veterans Village','Villa Maria Clara','West Kamias','West Triangle','White Plains'] },
          { name: 'San Juan', barangays: ['Addition Hills','Balong-Bato','Batis','Corazon de Jesus','Ermitaño','Greenhills','Isabelita','Kabayanan','Little Baguio','Maytunas','Onse','Pasadena','Pedro Cruz','Progreso','Rivera','Salapan','San Perfecto','Santa Lucia','Tibagan','West Crame'] },
          { name: 'Taguig', barangays: ['Bagumbayan','Bambang','Calzada','Central Bicutan','Central Signal Village','Fort Bonifacio','Hagonoy','Ibayo-Tipas','Katuparan','Ligid-Tipas','Lower Bicutan','Maharlika Village','Napindan','New Lower Bicutan','North Daang Hari','North Signal Village','Palingon','Pinagsama','San Miguel','Santa Ana','South Daang Hari','South Signal Village','Tanyag','Tuktukan','Upper Bicutan','Ususan','Wawa','Western Bicutan','East Rembo','West Rembo'] },
          { name: 'Valenzuela', barangays: ['Arkong Bato','Bagbaguin','Balangkas','Bignay','Bisig','Canumay East','Canumay West','Coloong','Dalandanan','Gen. T. de Leon','Isla','Karuhatan','Lawang Bato','Lingunan','Mabolo','Malanday','Malinta','Mapulang Lupa','Marulas','Maysan','Palasan','Parada','Pariancillo Villa','Pasolo','Poblacion','Polo','Punturin','Rincon','Tagalag','Ugong','Viente Reales','Wawang Pulo'] },
        ],
      },
    ],
  },
  {
    name: 'Region III – Central Luzon',
    provinces: [
      {
        name: 'Bulacan',
        cities: [
          { name: 'Malolos', barangays: ['Anilao','Atlag','Babatnin','Bagna','Bagong Bayan','Balayong','Balite','Bangkal','Barihan','Bulihan','Bungahan','Caingin','Calero','Caliligawan','Canalate','Caniogan','Catmon','Cofradia','Dakila','Guinhawa','Ligas','Liyang','Longos','Look 1st','Look 2nd','Lugam','Mabolo','Mambog','Masile','Matimbo','Mojon','Namayan','Niugan','Pamarawan','Panasahan','Pinagbakahan','San Agustin','San Gabriel','San Juan','San Pablo','San Vicente','Santiago','Santo Niño','Santo Rosario','Santol','Sumapang Bata','Sumapang Matanda','Taal','Tikay'] },
          { name: 'Meycauayan', barangays: ['Bagbaguin','Bahay Pare','Bancal','Banga','Bayugo','Caingin','Calvario','Camalig','Gasak','Hulo','Iba','Langka','Lawa','Libtong','Liputan','Longos','Malhacan','Pajo','Pantoc','Perez','Poblacion','Saluysoy','Saint Francis','Tugatog','Ubihan','Zamora'] },
          { name: 'San Jose del Monte', barangays: ['Assumption','Bagong Buhay I','Bagong Buhay II','Bagong Buhay III','Citrus','Ciudad Real','Dulong Bayan','Fatima I','Fatima II','Fatima III','Fatima IV','Fatima V','Francisco Homes-Guijo','Francisco Homes-Mulawin','Francisco Homes-Narra','Francisco Homes-Yakal','Gaya-Gaya','Graceville','Gumaok Central','Gumaok East','Gumaok West','Kaybanban','Kaypian','Lawang Pari','Maharlika','Minuyan I','Minuyan II','Minuyan III','Minuyan IV','Minuyan V','Minuyan Proper','Muzon','Paradise III','Poblacion','Sapang Palay Proper','St. Martin de Porres','Sto. Cristo','Sto. Niño I','Sto. Niño II','Tungkong Mangga'] },
        ],
      },
      {
        name: 'Pampanga',
        cities: [
          { name: 'San Fernando', barangays: ['Alasas','Baliti','Bulaon','Calulut','Del Carmen','Del Pilar','Del Rosario','Dolores','Juliana','Lara','Lourdes','Magliman','Maimpis','Malino','Malpitic','Pandaras','Panipuan','Pulung Bulu','Quebiawan','Saguin','San Agustin','San Felipe','San Isidro','San Jose','San Juan','San Nicolas','San Pedro','Santa Lucia','Santa Teresita','Santo Niño','Santo Rosario','Sindalan','Telabastagan'] },
          { name: 'Angeles', barangays: ['Agapito del Rosario','Amsic','Anunas','Balibago','Capaya','Claro M. Recto','Cuayan','Cutcut','Cutud','Lourdes North West','Lourdes Sur','Lourdes Sur East','Malabanias','Margot','Mining','Ninoy Aquino','Pampang','Pandan','Pulung Cacutud','Pulung Maragul','Pulungbulu','Salapungan','San Jose','San Nicolas','Santa Teresita','Santa Trinidad','Santo Cristo','Santo Domingo','Santo Rosario','Sapalibutad','Sapangbato','Tabun','Virgen Delos Remedios'] },
        ],
      },
    ],
  },
  {
    name: 'Region IV-A – CALABARZON',
    provinces: [
      {
        name: 'Cavite',
        cities: [
          { name: 'Bacoor', barangays: ['Alima','Aniban I','Aniban II','Aniban III','Aniban IV','Aniban V','Banalo','Bayanan','Campo Santo','Daang Bukid','Digman','Dulong Bayan','Habay I','Habay II','Kaingin','Ligas I','Ligas II','Ligas III','Mabolo I','Mabolo II','Mabolo III','Maliksi I','Maliksi II','Maliksi III','Mambog I','Mambog II','Mambog III','Mambog IV','Mambog V','Molino I','Molino II','Molino III','Molino IV','Molino V','Molino VI','Niog I','Niog II','Niog III','P.F. Espiritu I','P.F. Espiritu II','P.F. Espiritu III','P.F. Espiritu IV','P.F. Espiritu V','P.F. Espiritu VI','P.F. Espiritu VII','P.F. Espiritu VIII','Queens Row Central','Queens Row East','Queens Row West','Real I','Real II','Salinas I','Salinas II','Salinas III','Salinas IV','San Nicolas I','San Nicolas II','San Nicolas III','Sineguelasan','Tabing Dagat','Talaba I','Talaba II','Talaba III','Talaba IV','Talaba V','Talaba VI','Talaba VII','Zapote I','Zapote II','Zapote III','Zapote IV','Zapote V'] },
          { name: 'Dasmariñas', barangays: ['Burol I','Burol II','Burol III','Burol Main','Datu Esmael','Emmanuel Bergado I','Emmanuel Bergado II','Fatima I','Fatima II','Fatima III','Habay I','Habay II','Langkaan I','Langkaan II','Luzviminda I','Luzviminda II','Paliparan I','Paliparan II','Paliparan III','Sabang','Salawag','Salitran I','Salitran II','Salitran III','Salitran IV','Sampaloc I','Sampaloc II','Sampaloc III','Sampaloc IV','San Agustin I','San Agustin II','San Agustin III','San Andres I','San Andres II','San Esteban','San Jose','San Lorenzo Ruiz I','San Lorenzo Ruiz II','San Luis I','San Luis II','San Manuel I','San Manuel II','San Miguel I','San Miguel II','San Miguel III','San Simon','Santa Cristina I','Santa Cristina II','Santa Cruz I','Santa Cruz II','Santa Fe I','Santa Fe II','Santa Lucia','Santa Maria','Santiago','Santo Cristo I','Santo Cristo II','Santo Niño I','Santo Niño II','Tejero','Victoria Reyes','Zone I','Zone II','Zone III'] },
          { name: 'General Trias', barangays: ['Alingaro','Arnaldo','Bacao I','Bacao II','Bagumbayan','Biclatan','Buenavista I','Buenavista II','Buenavista III','Corregidor','Dulong Bayan','Gov. Ferrer','Javalera','Manggahan','Navarro','Ninety Sixth','Panungyanan','Pasong Camachile I','Pasong Camachile II','Pasong Kawayan I','Pasong Kawayan II','Pinagtipunan','Poblacion I','Poblacion II','Poblacion III','San Francisco','San Gabriel','San Juan I','San Juan II','Santiago','Tapia','Tejero','Vibora'] },
          { name: 'Imus', barangays: ['Alapan I-A','Alapan I-B','Alapan I-C','Alapan II-A','Alapan II-B','Anabu I-A','Anabu I-B','Anabu I-C','Anabu I-D','Anabu I-E','Anabu I-F','Anabu I-G','Anabu II-A','Anabu II-B','Anabu II-C','Anabu II-D','Anabu II-E','Anabu II-F','Bayan Luma I','Bayan Luma II','Bayan Luma III','Bayan Luma IV','Bayan Luma V','Bayan Luma VI','Bayan Luma VII','Bayan Luma VIII','Bayan Luma IX','Bucandala I','Bucandala II','Bucandala III','Bucandala IV','Bucandala V','Carsadang Bago I','Carsadang Bago II','Magdalo','Malagasang I-A','Malagasang I-B','Malagasang I-C','Malagasang I-D','Malagasang I-E','Malagasang I-F','Malagasang I-G','Malagasang II-A','Malagasang II-B','Malagasang II-C','Malagasang II-D','Malagasang II-E','Malagasang II-F','Malagasang II-G','Medicion I-A','Medicion I-B','Medicion I-C','Medicion I-D','Medicion II-A','Medicion II-B','Medicion II-C','Medicion II-D','Medicion II-E','Medicion II-F','Palico I','Palico II','Palico III','Palico IV','Pasong Buaya I','Pasong Buaya II','Poblacion I-A','Poblacion I-B','Poblacion I-C','Poblacion II-A','Poblacion II-B','Poblacion III-A','Poblacion III-B','Poblacion IV-A','Poblacion IV-B','Poblacion V-A','Poblacion V-B','Poblacion VI-A','Poblacion VI-B','Poblacion VII-A','Poblacion VII-B','Tanzang Luma I','Tanzang Luma II','Tanzang Luma III','Tanzang Luma IV','Tanzang Luma V','Tanzang Luma VI','Tinabunan','Toclong I-A','Toclong I-B','Toclong I-C','Toclong II-A','Toclong II-B'] },
          { name: 'Silang', barangays: ['Acacia','Adlas','Anahaw I','Anahaw II','Balite I','Balite II','Balubad','Banaba','Batas','Biga I','Biga II','Biluso','Buho','Bulihan','Cabangaan','Carmen','Hukay','Inchican','Ipil','Kalayaan','Kaong','Lalaan I','Lalaan II','Litlit','Lucsuhin','Lumil','Maguyam','Malabag','Malainen Bago','Malainen Luma','Malotoc','Mamplasan','Mataas na Burol','Munting Ilog','Niyugan','Paciano Rizal','Paligawan','Pasong Langka','Pooc I','Pooc II','Pulong Bunga','Pulong Saging','Puting Kahoy','Sabutan','San Isidro I','San Isidro II','San Jose','San Juan I','San Juan II','San Miguel I','San Miguel II','San Vicente I','San Vicente II','Santa Rosa I','Santa Rosa II','Santo Niño I','Santo Niño II','Santo Tomas','Tartaria','Tibig','Tranca','Tubuan I','Tubuan II','Tubuan III','Ulat','Yakal'] },
        ],
      },
      {
        name: 'Laguna',
        cities: [
          { name: 'Calauan', barangays: ['Balayhangin','Bangyas','Bukal','Burol','Dayap','Hanggan','Imok','Lawa','Mabacan','Masiit','Paliparan','Perez','Poblacion','Prinza','Pulo','Saimsim','Sampaloc','Sirang Lupa'] },
          { name: 'San Pedro', barangays: ['Bagong Silang','Calendola','Chrysanthemum','Cuyab','Estrella','Fatima','G.S.I.S.','Landayan','Langgam','Laram','Magsaysay','Maharlika','Narra','Nueva','Pacita I','Pacita II','Poblacion','Riverside','Rosario','Sampaguita','San Antonio','San Lorenzo Ruiz','San Vicente','Santo Niño','United Bayanihan','United Better Living'] },
          { name: 'Biñan', barangays: ['Biñan','Bungahan','Canlalay','Casile','De La Paz','Ganado','Langkiwa','Loma','Malaban','Malamig','Mampalasan','Platero','Poblacion','San Antonio','San Francisco','San Jose','San Vicente','Santo Domingo','Santo Niño','Santo Tomas','Soro-soro','Timbao','Tubigan','Zapote'] },
        ],
      },
      {
        name: 'Batangas',
        cities: [
          { name: 'Taal', barangays: ['Apacay','Aya','Balisong','Balitoc','Bihis','Bolbok','Buli','Butong','Carasuche','Cawit','Caysasay','Cuta','Dacanlao','Dao','Guiling','Janopol','Janopol Oriental','Luntal','Mahabang Lodlod','Niogan','Pansol','Poblacion 1','Poblacion 2','Poblacion 3','Poblacion 4','Poblacion 5','Poblacion 6','Poblacion 7','Poblacion 8','Poblacion 9','Poblacion 10','Poblacion 11','Poblacion 12','Sala','Sambat','San Agustin','Santor','Suplang','Talaga','Tierra Alta','Tulo','Wawa'] },
          { name: 'Batangas City', barangays: ['Alangilan','Balagtas','Balete','Banaba Center','Banaba East','Banaba Ibaba','Banaba West','Bilogo','Bolbok','Bukal','Calicanto','Catandala','Concepcion','Conde Itaas','Conde Labak','Cuta','Dalig','Dela Paz','Dela Paz Proper','Domoclay','Dumantay','Gulod Itaas','Gulod Labak','Haligue Kanluran','Haligue Silangan','Ilihan','Kumba','Kumintang Ibaba','Kumintang Ilaya','Libjo','Liponpon','Maapas','Mabacong','Mahabang Parang','Mahacot Kanluran','Mahacot Silangan','Malalim','Malibayo','Malitam','Maruclap','Mataas na Lupa','Matoco','Munting Mapino','Pagkilatan','Paharang Kanluran','Paharang Silangan','Pallocan Kanluran','Pallocan Silangan','Pinamucan Ibaba','Pinamucan Proper','Pinamucan Silangan','Poblacion Balagtas','Poblacion Kapitolyo','Sampaga','San Agapito','San Agustin Kanluran','San Agustin Silangan','San Andres','San Antonio','San Isidro','San Jose Sico','San Miguel','San Pedro','Santa Clara','Santa Rita Aplaya','Santa Rita Karsada','Santo Domingo','Santo Niño','Santo Tomas','Simlong','Sirang Lupa','Sorosoro Ibaba','Sorosoro Ilaya','Sorosoro Karsada','Tabangao Aplaya','Tabangao Dao','Tabangao Ambulong','Talahib Pandayan','Talahib Payapa','Talumpok Kanluran','Talumpok Silangan','Tinga Itaas','Tinga Labak','Tulo','Wawa'] },
        ],
      },
      {
        name: 'Rizal',
        cities: [
          { name: 'Rodriguez', barangays: ['Balite','Burgos','Geronimo','Macabud','Manggahan','Mascap','Puray','Rosario','San Isidro','San Jose','San Rafael'] },
          { name: 'Antipolo', barangays: ['Bagong Nayon','Beverly Hills','Calawis','Cupang','Dalig','Dela Paz','Inarawan','Mambugan','Mayamot','Muntingdilaw','San Jose','San Juan','San Luis','San Roque','Santa Cruz','Santo Niño','Tikling','Bagong Nayon II'] },
          { name: 'Cainta', barangays: ['Banting','Dela Paz','Karangalan Village','Sto. Domingo','San Andres','San Juan','Santa Rosa','Tagumpay'] },
        ],
      },
      {
        name: 'Quezon Province',
        cities: [
          { name: 'Candelaria', barangays: ['Buenavista','Bukal Norte','Bukal Sur','Kinatihan I','Kinatihan II','Malabanban Norte','Malabanban Sur','Mangilag Norte','Mangilag Sur','Masalukot I','Masalukot II','Masalukot III','Masalukot IV','Masalukot V','Mataas na Lupa','Pahinga Norte','Pahinga Sur','Poblacion','San Andres','San Isidro','Sucol'] },
        ],
      },
    ],
  },
]

// Flat helpers
export function getRegionNames(): string[] {
  return PH_REGIONS.map(r => r.name)
}

export function getProvinces(regionName: string): Province[] {
  return PH_REGIONS.find(r => r.name === regionName)?.provinces ?? []
}

export function getCities(regionName: string, provinceName?: string): City[] {
  if (!provinceName) {
    // Return all cities from all provinces in the region
    const region = PH_REGIONS.find(r => r.name === regionName)
    if (!region) return []
    return region.provinces.flatMap(p => p.cities)
  }
  return getProvinces(regionName).find(p => p.name === provinceName)?.cities ?? []
}

export function getBarangays(regionName: string, provinceName: string | undefined, cityName: string): string[] {
  if (!provinceName) {
    // Search all provinces in the region for the city
    const region = PH_REGIONS.find(r => r.name === regionName)
    if (!region) return []
    for (const province of region.provinces) {
      const city = province.cities.find(c => c.name === cityName)
      if (city) return city.barangays
    }
    return []
  }
  return getCities(regionName, provinceName).find(c => c.name === cityName)?.barangays ?? []
}
