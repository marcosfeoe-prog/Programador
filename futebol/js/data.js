// Dados fixos do universo fictício: países, nomes, ligas, clubes, veículos de imprensa.

export const NATIONS = {
  BRA: {
    name: 'Brasil', flag: '🇧🇷', adj: 'brasileiro',
    first: ['Thiago', 'Rafael', 'Lucas', 'Gabriel', 'Mateus', 'Caio', 'Diego', 'Vinícius', 'João Pedro', 'Igor', 'Renan', 'Wesley', 'Douglas', 'Marcelo', 'Éverton', 'Felipe', 'Davi', 'Kauã', 'Luan', 'Arthur', 'Breno', 'Danilo', 'Henrique', 'Murilo', 'Otávio', 'Rodrigo', 'Samuel', 'Talles', 'Yuri', 'Wellington', 'Jefferson', 'Alisson', 'Leandro', 'Fabrício', 'Guilherme', 'Ítalo', 'Pedro Henrique', 'Kaique', 'Robson', 'Nathan'],
    last: ['Albuquerque', 'Bezerra', 'Cardoso', 'Damasceno', 'Esteves', 'Figueiredo', 'Gouveia', 'Holanda', 'Jardim', 'Leitão', 'Macedo', 'Nogueira', 'Pacheco', 'Queiroz', 'Rezende', 'Sampaio', 'Tavares', 'Valadares', 'Xavier', 'Brandão', 'Coutinho', 'Dantas', 'Falcão', 'Guimarães', 'Lacerda', 'Moraes', 'Paiva', 'Rocha', 'Siqueira', 'Teles', 'Vasconcelos', 'Aragão', 'Barreto', 'Carvalhal', 'Frota', 'Mendonça', 'Pimentel', 'Saldanha', 'Torres', 'Veloso'],
    nick: ['Thiaguinho', 'Rafinha', 'Juninho', 'Biel', 'Dudu', 'Caíque', 'Pedrinho', 'Netinho', 'Lulinha', 'Kaká Jr.', 'Zezinho', 'Toninho', 'Bruninho', 'Gabigol Jr.', 'Fumaça', 'Pelado', 'Magrão', 'Neguinho', 'Ratinho', 'Formiga'],
  },
  ARG: {
    name: 'Argentina', flag: '🇦🇷', adj: 'argentino',
    first: ['Facundo', 'Lautaro', 'Matías', 'Nicolás', 'Santiago', 'Gonzalo', 'Ezequiel', 'Franco', 'Joaquín', 'Tomás', 'Agustín', 'Valentín', 'Leandro', 'Maximiliano', 'Federico', 'Emiliano', 'Thiago', 'Bautista', 'Ignacio', 'Cristian', 'Lucio', 'Germán', 'Ramiro', 'Rodrigo', 'Julián', 'Mauro', 'Alexis', 'Benjamín', 'Hernán', 'Pablo'],
    last: ['Acuña', 'Bustamante', 'Cabral', 'Echeverría', 'Ferreyra', 'Gaitán', 'Ibarra', 'Ledesma', 'Medina', 'Navarro', 'Ojeda', 'Palacios', 'Quiroga', 'Rivero', 'Sosa', 'Toledo', 'Villalba', 'Zárate', 'Benítez', 'Cáceres', 'Domínguez', 'Godoy', 'Luna', 'Maidana', 'Paredes', 'Romero', 'Saravia', 'Vega', 'Aguirre', 'Correa', 'Funes', 'Montiel'],
    nick: ['el Chino', 'el Pibe', 'el Tanque', 'el Mudo', 'el Flaco', 'el Turco', 'el Colo', 'el Ruso', 'el Cuchu', 'el Pocho'],
  },
  FRA: {
    name: 'França', flag: '🇫🇷', adj: 'francês',
    first: ['Antoine', 'Hugo', 'Théo', 'Lucas', 'Mathis', 'Enzo', 'Kylian', 'Nathan', 'Jules', 'Raphaël', 'Maxime', 'Clément', 'Yanis', 'Bastien', 'Adrien', 'Moussa', 'Ibrahima', 'Rayan', 'Florian', 'Corentin', 'Aurélien', 'Benoît', 'Damien', 'Loïc', 'Quentin', 'Sofiane', 'Tanguy', 'Warren', 'Youssouf', 'Ludovic'],
    last: ['Arnaud', 'Bertrand', 'Chevalier', 'Dubois', 'Fontaine', 'Garnier', 'Lefèvre', 'Marchand', 'Moreau', 'Perrin', 'Rousseau', 'Vidal', 'Lambert', 'Girard', 'Bonnet', 'Mercier', 'Blanc', 'Guérin', 'Faure', 'Renaud', 'Diallo', 'Traoré', 'Koné', 'Camara', 'Sissoko', 'Benali', 'Mbemba', 'Duval', 'Leclerc', 'Masson'],
    nick: [],
  },
  ESP: {
    name: 'Espanha', flag: '🇪🇸', adj: 'espanhol',
    first: ['Álvaro', 'Pablo', 'Sergio', 'Iker', 'Marcos', 'Unai', 'Javier', 'Adrián', 'Hugo', 'Daniel', 'Alejandro', 'Raúl', 'Mikel', 'Rubén', 'Óscar', 'Gerard', 'Aitor', 'Borja', 'Íñigo', 'Jorge', 'Carlos', 'Víctor', 'Diego', 'Fermín', 'Gonzalo', 'Martín', 'Nacho', 'Pau', 'Samu', 'Yeray'],
    last: ['Alcántara', 'Bermúdez', 'Castaño', 'Del Río', 'Escudero', 'Fuentes', 'Garrido', 'Herrera', 'Iglesias', 'Jiménez', 'Lozano', 'Marín', 'Núñez', 'Ortega', 'Prieto', 'Quintana', 'Rubio', 'Serrano', 'Toral', 'Urquiza', 'Valverde', 'Zabaleta', 'Arrieta', 'Cuesta', 'Montoya', 'Peña', 'Salinas', 'Velasco', 'Etxeberria', 'Olmedo'],
    nick: ['Isco Jr.', 'Fer', 'Dani', 'Rafa', 'Chema', 'Kike'],
  },
  ENG: {
    name: 'Inglaterra', flag: '🏴', adj: 'inglês',
    first: ['Harry', 'Jack', 'Oliver', 'George', 'Callum', 'Mason', 'Declan', 'Jordan', 'Reece', 'Tyler', 'Connor', 'Ben', 'Jamie', 'Liam', 'Luke', 'Aaron', 'Kieran', 'Marcus', 'Ollie', 'Ryan', 'Sam', 'Toby', 'Will', 'Alfie', 'Ethan', 'Freddie', 'Jacob', 'Lewis', 'Noah', 'Rhys'],
    last: ['Ashworth', 'Bellamy', 'Carver', 'Dawson', 'Ellery', 'Fletcher', 'Granger', 'Hartley', 'Kingsley', 'Lockwood', 'Marsh', 'Norwood', 'Pemberton', 'Radcliffe', 'Sutton', 'Thornton', 'Whitmore', 'Yardley', 'Bradshaw', 'Cartwright', 'Harrington', 'Mitchell', 'Prescott', 'Thompson', 'Webb', 'Holloway', 'Barker', 'Foster', 'Gibbs', 'Stone'],
    nick: [],
  },
  POR: {
    name: 'Portugal', flag: '🇵🇹', adj: 'português',
    first: ['Rúben', 'Diogo', 'Gonçalo', 'Tiago', 'Rafael', 'Bernardo', 'Nuno', 'Vitinha', 'Francisco', 'Duarte', 'Afonso', 'Martim', 'Rodrigo', 'Henrique', 'Simão'],
    last: ['Antunes', 'Belchior', 'Carvalho', 'Fonseca', 'Lopes', 'Magalhães', 'Neves', 'Pinto', 'Quaresma', 'Sequeira', 'Teixeira', 'Vieira', 'Correia', 'Gomes', 'Matos'],
    nick: [],
  },
  ITA: {
    name: 'Itália', flag: '🇮🇹', adj: 'italiano',
    first: ['Alessandro', 'Federico', 'Lorenzo', 'Matteo', 'Riccardo', 'Davide', 'Giacomo', 'Nicolò', 'Simone', 'Tommaso', 'Andrea', 'Gianluca', 'Marco', 'Pietro', 'Stefano'],
    last: ['Bellini', 'Caruso', 'De Santis', 'Esposito', 'Ferraro', 'Galli', 'Lombardi', 'Mancini', 'Ricci', 'Santoro', 'Testa', 'Vitale', 'Barone', 'Colombo', 'Moretti'],
    nick: [],
  },
  GER: {
    name: 'Alemanha', flag: '🇩🇪', adj: 'alemão',
    first: ['Leon', 'Jonas', 'Florian', 'Niklas', 'Timo', 'Kai', 'Lukas', 'Maximilian', 'Felix', 'Julian', 'Moritz', 'Jannik', 'Tobias', 'Lennart', 'Erik'],
    last: ['Brandt', 'Fischer', 'Hoffmann', 'Krüger', 'Lehmann', 'Neumann', 'Richter', 'Schäfer', 'Vogel', 'Weber', 'Zimmermann', 'Becker', 'Hartmann', 'Keller', 'Wolf'],
    nick: [],
  },
  URU: {
    name: 'Uruguai', flag: '🇺🇾', adj: 'uruguaio',
    first: ['Facundo', 'Rodrigo', 'Maximiliano', 'Nahitan', 'Giorgian', 'Agustín', 'Brian', 'Santiago', 'Matías', 'Darwin', 'Mathías', 'Sebastián'],
    last: ['Arambarri', 'Bentancur', 'Cardozo', 'De la Cruz', 'Fernández', 'Laxalt', 'Olivera', 'Pereiro', 'Rodríguez', 'Silvera', 'Torreira', 'Viña'],
    nick: ['el Ruso', 'el Pato', 'el Cebolla', 'el Tero'],
  },
  COL: {
    name: 'Colômbia', flag: '🇨🇴', adj: 'colombiano',
    first: ['Jhon', 'Yerry', 'Juan Camilo', 'Duván', 'Jefferson', 'Wílmar', 'Andrés', 'Kevin', 'Brayan', 'Déiver', 'Jhon Jáder', 'Yáser'],
    last: ['Arias', 'Borja', 'Cuadrado', 'Díaz', 'Lerma', 'Mina', 'Mojica', 'Quintero', 'Restrepo', 'Sinisterra', 'Uribe', 'Zapata'],
    nick: [],
  },
  NGA: {
    name: 'Nigéria', flag: '🇳🇬', adj: 'nigeriano',
    first: ['Chukwuemeka', 'Victor', 'Samuel', 'Ademola', 'Kelechi', 'Wilfred', 'Alex', 'Taiwo', 'Calvin', 'Moses', 'Ola', 'Chidera'],
    last: ['Adeyemi', 'Balogun', 'Chukwueze', 'Eze', 'Iheanacho', 'Nwankwo', 'Okafor', 'Onuachu', 'Osimhen-Ade', 'Uzoho', 'Ndidi-Obi', 'Ajayi'],
    nick: [],
  },
  SEN: {
    name: 'Senegal', flag: '🇸🇳', adj: 'senegalês',
    first: ['Ismaïla', 'Pape', 'Cheikhou', 'Idrissa', 'Boulaye', 'Nampalys', 'Abdou', 'Krépin', 'Moussa', 'Habib', 'Lamine', 'Iliman'],
    last: ['Ndiaye', 'Sarr', 'Gueye', 'Diatta', 'Mendy', 'Kouyaté', 'Cissé', 'Faye', 'Diop', 'Seck', 'Ba', 'Thiam'],
    nick: [],
  },
  NED: {
    name: 'Holanda', flag: '🇳🇱', adj: 'holandês',
    first: ['Daan', 'Joey', 'Teun', 'Stefan', 'Ryan', 'Xavi', 'Jurriën', 'Bart', 'Sem', 'Luuk', 'Wout', 'Jesper'],
    last: ['de Groot', 'van Dijkstra', 'Bakker', 'Janssen', 'Visser', 'Smit', 'de Boer', 'Mulder', 'van Leeuwen', 'Kuipers', 'Vermeer', 'Hendriks'],
    nick: [],
  },
  JPN: {
    name: 'Japão', flag: '🇯🇵', adj: 'japonês',
    first: ['Takumi', 'Kaoru', 'Daichi', 'Ritsu', 'Takefusa', 'Wataru', 'Hiroki', 'Yuki', 'Ao', 'Kento', 'Shoma', 'Ren'],
    last: ['Tanaka', 'Mitoma', 'Kubota', 'Endō', 'Itakura', 'Nakamura', 'Morita', 'Hatate', 'Ueda', 'Sugawara', 'Ogawa', 'Kamada'],
    nick: [],
  },
  MAR: {
    name: 'Marrocos', flag: '🇲🇦', adj: 'marroquino',
    first: ['Achraf', 'Hakim', 'Sofyan', 'Azzedine', 'Youssef', 'Nayef', 'Bilal', 'Abde', 'Selim', 'Amine', 'Ilias', 'Ayoub'],
    last: ['El Amrani', 'Benali', 'Ziani', 'Ounahi', 'Bounou-Rahi', 'Mazraoui-Said', 'Aguerd-Lahlou', 'Chakir', 'Haddadi', 'El Khannouss', 'Idrissi', 'Tazi'],
    nick: [],
  },
  CIV: {
    name: 'Costa do Marfim', flag: '🇨🇮', adj: 'marfinense',
    first: ['Franck', 'Wilfried', 'Serge', 'Odilon', 'Simon', 'Seko', 'Ibrahim', 'Jean-Philippe', 'Evan', 'Oumar', 'Christian', 'Hamed'],
    last: ['Kessié-Bah', 'Zaha-Koffi', 'Aurier-Yao', 'Kossounou-Té', 'Adingra-Kouamé', 'Fofana', 'Sangaré', 'Konan', 'Gbamin', 'Boli', 'Diomandé', 'Touré'],
    nick: [],
  },
  CRO: {
    name: 'Croácia', flag: '🇭🇷', adj: 'croata',
    first: ['Luka', 'Ivan', 'Mateo', 'Josip', 'Marko', 'Nikola', 'Mario', 'Lovro', 'Borna', 'Dominik'],
    last: ['Babić', 'Horvat', 'Jurić', 'Kovačić-Vuk', 'Marić', 'Novak', 'Perković', 'Šimić', 'Tomić', 'Vidović'],
    nick: [],
  },
  MEX: {
    name: 'México', flag: '🇲🇽', adj: 'mexicano',
    first: ['Hirving', 'Edson', 'Raúl', 'Santiago', 'César', 'Orbelín', 'Luis', 'Julián', 'Érick', 'Uriel'],
    last: ['Antuna', 'Chávez', 'Gallardo', 'Huerta', 'Lainez', 'Montes', 'Pineda', 'Quiñones', 'Vásquez', 'Zendejas'],
    nick: ['el Chucky Jr.', 'el Tecatito', 'el Machín'],
  },
  USA: {
    name: 'Estados Unidos', flag: '🇺🇸', adj: 'norte-americano',
    first: ['Christian', 'Weston', 'Tyler', 'Gio', 'Brenden', 'Josh', 'Timothy', 'Ricardo', 'Malik', 'Cade'],
    last: ['Adams-Reed', 'Carter', 'Dempsey-Hale', 'Ferreira-Cole', 'Hayes', 'Morgan', 'Parker', 'Robinson', 'Sullivan', 'Walker'],
    nick: [],
  },
  GHA: {
    name: 'Gana', flag: '🇬🇭', adj: 'ganês',
    first: ['Kwame', 'Kofi', 'Mohammed', 'Thomas', 'Jordan', 'Inaki', 'Antoine', 'Kamaldeen', 'Abdul', 'Ernest'],
    last: ['Asante', 'Boateng', 'Mensah', 'Owusu', 'Partey-Nii', 'Sulemana', 'Kudus-Adjei', 'Agyeman', 'Opoku', 'Nuamah'],
    nick: [],
  },
};

// Proporção de nacionalidades por liga (país doméstico + estrangeiros prováveis)
export const LEAGUE_NATION_MIX = {
  ENG: [['ENG', 45], ['FRA', 6], ['ESP', 5], ['BRA', 7], ['POR', 5], ['NED', 5], ['GER', 4], ['NGA', 4], ['SEN', 4], ['GHA', 3], ['CIV', 3], ['ARG', 3], ['JPN', 2], ['USA', 2], ['CRO', 2], ['COL', 2], ['URU', 2]],
  ESP: [['ESP', 50], ['ARG', 6], ['BRA', 7], ['FRA', 6], ['URU', 4], ['COL', 4], ['MAR', 5], ['POR', 4], ['MEX', 3], ['GER', 2], ['ITA', 2], ['JPN', 2], ['CRO', 2], ['SEN', 2]],
  BRA: [['BRA', 72], ['ARG', 7], ['URU', 6], ['COL', 6], ['POR', 3], ['MEX', 2], ['USA', 2], ['JPN', 2]],
  FRA: [['FRA', 52], ['SEN', 8], ['CIV', 7], ['MAR', 7], ['NGA', 4], ['GHA', 3], ['BRA', 5], ['POR', 3], ['ITA', 2], ['GER', 2], ['NED', 3], ['ARG', 2], ['JPN', 2]],
  ARG: [['ARG', 78], ['URU', 8], ['COL', 6], ['BRA', 3], ['MEX', 2], ['ESP', 2], ['ITA', 1]],
};

// Ligas — rank: 1 = mais competitiva do mundo. base = nível médio dos elencos.
export const LEAGUES = [
  {
    id: 'PL', name: 'The Premier League', country: 'Inglaterra', nation: 'ENG', rank: 1, stars: 5, base: 79, color: '#5b2bd1',
    teams: [
      { name: 'Kingsbridge United', short: 'KBU', city: 'Kingsbridge', nickname: 'Os Leões Vermelhos', stadium: 'Crown Park', colors: ['#c8102e', '#ffffff'], pattern: 'solid', tier: 1 },
      { name: 'Northvale City', short: 'NVC', city: 'Northvale', nickname: 'Os Celestes', stadium: 'Etherington Arena', colors: ['#6cabdd', '#1c2c5b'], pattern: 'solid', tier: 1 },
      { name: 'Ashford Rovers', short: 'ASR', city: 'Ashford', nickname: 'Os Canhoneiros', stadium: 'The Foundry', colors: ['#e30613', '#ffffff'], pattern: 'sleeves', tier: 2 },
      { name: 'Blackwater Wanderers', short: 'BWW', city: 'Blackwater', nickname: 'Os Andarilhos', stadium: 'Molyneaux Road', colors: ['#f2a900', '#111111'], pattern: 'solid', tier: 3 },
      { name: 'Redmoor Athletic', short: 'RMA', city: 'Redmoor', nickname: 'Os Martelos', stadium: 'Moorside Stadium', colors: ['#7a263a', '#1bb1e7'], pattern: 'sleeves', tier: 3 },
      { name: 'Eastport FC', short: 'EPT', city: 'Eastport', nickname: 'Os Marinheiros', stadium: 'Harbour Lane', colors: ['#034694', '#ffffff'], pattern: 'solid', tier: 1 },
      { name: 'Wexley Hotspurs', short: 'WEX', city: 'Wexley', nickname: 'Os Esporas', stadium: 'White Heath', colors: ['#ffffff', '#132257'], pattern: 'solid', tier: 2 },
      { name: 'Castleford Albion', short: 'CFA', city: 'Castleford', nickname: 'Os Gaviões', stadium: 'Albion Grounds', colors: ['#0057b8', '#ffffff'], pattern: 'stripes', tier: 4 },
      { name: 'Merseyvale Town', short: 'MVT', city: 'Merseyvale', nickname: 'Os Toffees', stadium: 'Goodwood Park', colors: ['#003399', '#ffffff'], pattern: 'solid', tier: 3 },
      { name: 'Stonebridge Forest', short: 'SBF', city: 'Stonebridge', nickname: 'Os Arqueiros', stadium: 'Trentside', colors: ['#dd0000', '#ffffff'], pattern: 'hoops', tier: 4 },
    ],
  },
  {
    id: 'LL', name: 'La Liga Série A', country: 'Espanha', nation: 'ESP', rank: 2, stars: 5, base: 77, color: '#ee8707',
    teams: [
      { name: 'Real Montalbán', short: 'RMO', city: 'Montalbán', nickname: 'Los Blancos de la Meseta', stadium: 'Estadio Alcázar Real', colors: ['#ffffff', '#d4af37'], pattern: 'solid', tier: 1 },
      { name: 'FC Ribera Blaugrana', short: 'FRB', city: 'Ribera', nickname: 'Los Culés del Mar', stadium: 'Camp Ribera', colors: ['#a50044', '#004d98'], pattern: 'stripes', tier: 1 },
      { name: 'Atlético Valdoria', short: 'ATV', city: 'Valdoria', nickname: 'Los Colchoneros', stadium: 'Metropolitano de Valdoria', colors: ['#cb3524', '#ffffff'], pattern: 'stripes', tier: 2 },
      { name: 'Sevillana Hispalis', short: 'SEH', city: 'Hispalis', nickname: 'Los Nervionenses', stadium: 'Ramón Albero', colors: ['#ffffff', '#d40000'], pattern: 'solid', tier: 3 },
      { name: 'Real Sociedad Txingudi', short: 'RST', city: 'Txingudi', nickname: 'Los Txuri-Urdin', stadium: 'Anoeta Berri', colors: ['#0067b1', '#ffffff'], pattern: 'stripes', tier: 3 },
      { name: 'Villamar CF', short: 'VMR', city: 'Villamar', nickname: 'El Submarino Amarillo', stadium: 'La Cerámica del Mar', colors: ['#ffe667', '#005187'], pattern: 'solid', tier: 3 },
      { name: 'Athletic Gaztelu', short: 'ATG', city: 'Gaztelu', nickname: 'Los Leones Vascos', stadium: 'San Mamés Txiki', colors: ['#ee2523', '#ffffff'], pattern: 'stripes', tier: 2 },
      { name: 'Racing Puerto Azul', short: 'RPA', city: 'Puerto Azul', nickname: 'Los Racinguistas', stadium: 'El Sardinero Azul', colors: ['#00a650', '#ffffff'], pattern: 'stripes', tier: 4 },
      { name: 'Deportivo Marisol', short: 'DMS', city: 'Marisol', nickname: 'El Super Depor', stadium: 'Riazor Sur', colors: ['#0055a4', '#ffffff'], pattern: 'stripes', tier: 4 },
      { name: 'Celta Ría Baixa', short: 'CRB', city: 'Ría Baixa', nickname: 'Los Celestes Gallegos', stadium: 'Balaídos Novo', colors: ['#8ac3ee', '#ffffff'], pattern: 'solid', tier: 4 },
    ],
  },
  {
    id: 'BR', name: 'Liga Brasileira A1', country: 'Brasil', nation: 'BRA', rank: 3, stars: 4, base: 73, color: '#009b3a',
    teams: [
      { name: 'Clube de Regatas Guanabara', short: 'CRG', city: 'Rio de Janeiro', nickname: 'O Mais Querido', stadium: 'Estádio Maracá', colors: ['#c4161c', '#111111'], pattern: 'hoops', tier: 1 },
      { name: 'Sociedade Esportiva Paulistana', short: 'SEP', city: 'São Paulo', nickname: 'O Verdão', stadium: 'Arena Parque Alviverde', colors: ['#006437', '#ffffff'], pattern: 'solid', tier: 1 },
      { name: 'Atlético Serrano', short: 'ASE', city: 'Belo Horizonte', nickname: 'O Galo da Serra', stadium: 'Arena das Gerais', colors: ['#111111', '#ffffff'], pattern: 'stripes', tier: 2 },
      { name: 'Grêmio Minuano', short: 'GRM', city: 'Porto Alegre', nickname: 'O Imortal', stadium: 'Arena do Minuano', colors: ['#0d80bf', '#111111'], pattern: 'stripes', tier: 2 },
      { name: 'Esporte Clube Capibaribe', short: 'ECC', city: 'Recife', nickname: 'O Leão da Ilha', stadium: 'Ilha do Capibaribe', colors: ['#d71920', '#111111'], pattern: 'hoops', tier: 3 },
      { name: 'Fortaleza do Sol', short: 'FDS', city: 'Fortaleza', nickname: 'O Leão do Pici', stadium: 'Castelão do Sol', colors: ['#0b3d91', '#d71920'], pattern: 'hoops', tier: 3 },
      { name: 'Bahia de Todos os Santos', short: 'BTS', city: 'Salvador', nickname: 'O Esquadrão', stadium: 'Arena Fonte Velha', colors: ['#004a99', '#e30613'], pattern: 'sash', tier: 3 },
      { name: 'Vila Esperança FC', short: 'VES', city: 'Santos', nickname: 'O Peixe da Vila', stadium: 'Vila Esperança', colors: ['#ffffff', '#111111'], pattern: 'solid', tier: 2 },
      { name: 'Coritiba das Araucárias', short: 'CDA', city: 'Curitiba', nickname: 'O Coxa', stadium: 'Couto das Araucárias', colors: ['#00543c', '#ffffff'], pattern: 'hoops', tier: 4 },
      { name: 'Goiânia Esmeralda EC', short: 'GEE', city: 'Goiânia', nickname: 'O Verdão do Cerrado', stadium: 'Serra Esmeralda', colors: ['#0f8a3c', '#ffffff'], pattern: 'solid', tier: 4 },
    ],
  },
  {
    id: 'FR', name: 'França League One', country: 'França', nation: 'FRA', rank: 4, stars: 4, base: 71, color: '#1d4ed8',
    teams: [
      { name: 'Paris Saint-Aubin', short: 'PSA', city: 'Paris', nickname: 'Les Rouge et Bleu', stadium: 'Parc de Saint-Aubin', colors: ['#004170', '#da291c'], pattern: 'stripes', tier: 1 },
      { name: 'Olympique de Valmont', short: 'OVM', city: 'Valmont', nickname: 'Les Phocéens', stadium: 'Stade Vélodrome du Sud', colors: ['#ffffff', '#2faee0'], pattern: 'solid', tier: 1 },
      { name: 'AS Bellerive', short: 'ASB', city: 'Bellerive', nickname: 'Les Monégasques du Lac', stadium: 'Stade Louis Bellerive', colors: ['#e51b22', '#ffffff'], pattern: 'half', tier: 2 },
      { name: 'Olympique Rhodanien', short: 'ORH', city: 'Lyonnais', nickname: 'Les Gones', stadium: 'Groupama Rhône', colors: ['#ffffff', '#1c3f94'], pattern: 'sash', tier: 2 },
      { name: 'LOSC Flandres', short: 'LFL', city: 'Flandres', nickname: 'Les Dogues', stadium: 'Pierre-Mauroy Nord', colors: ['#e01e13', '#20325f'], pattern: 'solid', tier: 3 },
      { name: 'Stade Montclair', short: 'SMC', city: 'Montclair', nickname: 'Les Rouge et Noir', stadium: 'Roazhon Montclair', colors: ['#e13327', '#111111'], pattern: 'solid', tier: 3 },
      { name: 'RC Côte d\'Opale', short: 'RCO', city: 'Côte d\'Opale', nickname: 'Les Sang et Or', stadium: 'Bollaert-Opale', colors: ['#ffd700', '#e30613'], pattern: 'stripes', tier: 3 },
      { name: 'OGC Riviera', short: 'OGR', city: 'Riviera', nickname: 'Les Aiglons', stadium: 'Allianz Riviera Sud', colors: ['#c4161c', '#111111'], pattern: 'stripes', tier: 4 },
      { name: 'FC Nantes-Loire', short: 'FNL', city: 'Nantes-Loire', nickname: 'Les Canaris', stadium: 'La Beaujoire-Loire', colors: ['#fcd405', '#00843d'], pattern: 'solid', tier: 4 },
      { name: 'Girondins de l\'Estuaire', short: 'GDE', city: 'Estuaire', nickname: 'Les Marine et Blanc', stadium: 'Matmut Estuaire', colors: ['#1b2a4a', '#ffffff'], pattern: 'chevron', tier: 4 },
    ],
  },
  {
    id: 'AR', name: 'Primera Liga Argentina', country: 'Argentina', nation: 'ARG', rank: 5, stars: 3, base: 69, color: '#38a3e0',
    teams: [
      { name: 'Club Atlético Río Plateado', short: 'CRP', city: 'Buenos Aires', nickname: 'El Millonario', stadium: 'Monumental del Plata', colors: ['#ffffff', '#e30613'], pattern: 'sash', tier: 1 },
      { name: 'Club Atlético La Ribera', short: 'CLR', city: 'Buenos Aires', nickname: 'El Xeneize', stadium: 'La Bombonera Sur', colors: ['#103f79', '#f3b229'], pattern: 'band', tier: 1 },
      { name: 'Racing Club Avellanense', short: 'RCA', city: 'Avellaneda', nickname: 'La Academia', stadium: 'Cilindro Presidente', colors: ['#7bb6e8', '#ffffff'], pattern: 'stripes', tier: 2 },
      { name: 'CA Independencia', short: 'CAI', city: 'Avellaneda', nickname: 'El Rojo', stadium: 'Libertadores de América Sur', colors: ['#e30613', '#ffffff'], pattern: 'solid', tier: 2 },
      { name: 'San Lorenzo de Almagro Sur', short: 'SLA', city: 'Boedo', nickname: 'El Ciclón', stadium: 'Nuevo Gasómetro Sur', colors: ['#1e3a8a', '#c8102e'], pattern: 'stripes', tier: 3 },
      { name: 'Estudiantes del Plata', short: 'EDP', city: 'La Plata', nickname: 'El Pincha', stadium: 'Uno del Plata', colors: ['#e30613', '#ffffff'], pattern: 'stripes', tier: 3 },
      { name: 'Rosario Central del Paraná', short: 'RCP', city: 'Rosario', nickname: 'El Canalla', stadium: 'Gigante del Paraná', colors: ['#0a3d8f', '#ffd400'], pattern: 'stripes', tier: 3 },
      { name: 'Newell\'s Old Rosarinos', short: 'NOR', city: 'Rosario', nickname: 'La Lepra', stadium: 'Coloso del Parque', colors: ['#e30613', '#111111'], pattern: 'half', tier: 3 },
      { name: 'Vélez del Oeste', short: 'VDO', city: 'Liniers', nickname: 'El Fortín', stadium: 'José Amalfitani Oeste', colors: ['#ffffff', '#0a3d8f'], pattern: 'chevron', tier: 4 },
      { name: 'Talleres de Córdoba Norte', short: 'TCN', city: 'Córdoba', nickname: 'La T', stadium: 'Mario Kempes Norte', colors: ['#0a2a5e', '#ffffff'], pattern: 'stripes', tier: 4 },
    ],
  },
];

export const OUTLETS = [
  { name: 'Gazeta da Bola', style: 'tradicional', color: '#d61f26' },
  { name: 'Planeta Gol', style: 'popular', color: '#0aa04a' },
  { name: 'The Daily Pitch', style: 'britânico', color: '#1a3d8f' },
  { name: 'Olé Mundial', style: 'apaixonado', color: '#0e7ac4' },
  { name: 'L\'Écho du Foot', style: 'analítico', color: '#2b4a9b' },
  { name: 'Marcador Ibérico', style: 'ibérico', color: '#c2410c' },
  { name: 'Bastidores FC', style: 'fofoca', color: '#9333ea' },
  { name: 'Prancheta Tática', style: 'tático', color: '#0f766e' },
];

export const JOURNALISTS = [
  'Helena Furtado', 'Marcos Vilela', 'Oliver Grant', 'Sofía Lagos', 'Pierre Duclos', 'Ana Beatriz Rangel', 'Tomás Echague', 'Priya Nandakumar', 'Rui Patrício Leme', 'Camille Arnoux', 'Diego Salvatierra', 'Fernanda Quintela', 'James Whitlock', 'Lucía Montenegro', 'Bruno Kessler',
];

export const COACH_FIRST = ['Mauricio', 'Carlo', 'Jürgen', 'Pep', 'Abel', 'Diego', 'Marcelo', 'Luis', 'Didier', 'Mikel', 'Unai', 'Roger', 'Fernando', 'Thomas', 'Xabi', 'Renato', 'Tite', 'Hernán', 'Claude', 'Gareth'];
export const COACH_LAST = ['Peregrino', 'Ancellotti', 'Klopfer', 'Guardián', 'Ferraz', 'Simeoni', 'Gallardini', 'Enríquez', 'Deschamps-Roy', 'Arteaga', 'Emeri', 'Machado', 'Diniz Neto', 'Tuchel-Brandt', 'Alonso Ruiz', 'Gaúcho', 'Bachi', 'Crespi', 'Puel-Martin', 'Southworth'];

// Posições da formação 4-3-3 (11 titulares)
export const FORMATION = ['GOL', 'LD', 'ZAG', 'ZAG', 'LE', 'VOL', 'MC', 'MEI', 'PD', 'PE', 'ATA'];

export const POS_INFO = {
  GOL: { name: 'Goleiro', group: 'GK' },
  LD: { name: 'Lateral-direito', group: 'DEF' },
  ZAG: { name: 'Zagueiro', group: 'DEF' },
  LE: { name: 'Lateral-esquerdo', group: 'DEF' },
  VOL: { name: 'Volante', group: 'MID' },
  MC: { name: 'Meio-campista', group: 'MID' },
  MEI: { name: 'Meia-atacante', group: 'MID' },
  PD: { name: 'Ponta-direita', group: 'FWD' },
  PE: { name: 'Ponta-esquerda', group: 'FWD' },
  ATA: { name: 'Centroavante', group: 'FWD' },
};

// Pesos por posição (para gols e assistências)
export const GOAL_WEIGHT = { GOL: 0.002, LD: 0.25, ZAG: 0.35, LE: 0.25, VOL: 0.35, MC: 0.7, MEI: 1.3, PD: 1.7, PE: 1.7, ATA: 3.2 };
export const ASSIST_WEIGHT = { GOL: 0.02, LD: 0.7, ZAG: 0.2, LE: 0.7, VOL: 0.5, MC: 1.2, MEI: 2.0, PD: 1.6, PE: 1.6, ATA: 0.9 };

export const MONTHS = ['Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio'];

export const TRAITS = {
  profissional: { name: 'Profissional', drama: 0.3, desc: 'Disciplinado, primeiro a chegar ao CT.' },
  lider: { name: 'Líder', drama: 0.6, desc: 'Fala alto no vestiário e cobra os companheiros.' },
  temperamental: { name: 'Temperamental', drama: 2.4, desc: 'Pavio curto dentro e fora de campo.' },
  baladeiro: { name: 'Baladeiro', drama: 2.2, desc: 'Adora uma noite agitada.' },
  marrento: { name: 'Marrento', drama: 1.8, desc: 'Provoca adversários e torcidas.' },
  midiatico: { name: 'Midiático', drama: 1.5, desc: 'Vive nas redes sociais e em campanhas publicitárias.' },
  timido: { name: 'Tímido', drama: 0.4, desc: 'Evita entrevistas e holofotes.' },
  mercenario: { name: 'Ambicioso', drama: 1.4, desc: 'Sempre de olho em um contrato melhor.' },
  idolo: { name: 'Ídolo da torcida', drama: 0.7, desc: 'Identificação enorme com o clube.' },
  decisivo: { name: 'Decisivo', drama: 0.8, desc: 'Cresce em jogos grandes.' },
};
