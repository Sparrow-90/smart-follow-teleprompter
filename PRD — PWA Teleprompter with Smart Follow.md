# PRD — PWA Teleprompter with Smart Follow

**Wersja:** 1.0  
**Status:** MVP Definition  
**Typ produktu:** Progressive Web App  
**Primary device:** Tablet  
**Secondary devices:** Smartphone, laptop / desktop  
**Model działania:** Offline-first, on-device, zero-cost core

---

# 1. Product Overview

Produkt jest minimalistyczną aplikacją webową PWA typu teleprompter, przeznaczoną przede wszystkim dla prezenterów, dziennikarzy, reporterów oraz osób pracujących profesjonalnie z materiałem wideo.

Główną przewagą produktu jest **Smart Follow**, czyli lokalnie działający system rozpoznający, w którym miejscu skryptu znajduje się prezenter, i dostosowujący pozycję tekstu do naturalnego tempa jego wypowiedzi.

Użytkownik nie powinien dopasowywać sposobu mówienia do prędkości telepromptera.

**Teleprompter powinien dopasowywać się do użytkownika.**

Podstawowy flow produktu:

**Paste → Setup → Prompt**

Aplikacja nie jest narzędziem do nagrywania, montażu ani tworzenia skryptów. Jej głównym zadaniem jest zapewnienie możliwie najlepszego doświadczenia podczas profesjonalnego czytania przygotowanego wcześniej tekstu.

---

# 2. Product Vision

Stworzyć teleprompter, o którym użytkownik przestaje myśleć w momencie rozpoczęcia nagrania.

Produkt powinien łączyć:

- profesjonalną kontrolę
- minimalistyczny interfejs
- naturalne zachowanie tekstu
- szybkie przygotowanie do pracy
- inteligentne śledzenie wypowiedzi
- prywatność
- działanie offline
- brak obowiązkowych płatnych usług
- możliwość działania bez własnego backendu

Docelowe doświadczenie:

> **Speak naturally. Your script follows.**

Techniczna idea Smart Follow:

> **It knows where you are.**

---

# 3. Problem Statement

Klasyczne telepromptery wymagają od prezentera dopasowania sposobu mówienia do wcześniej ustawionej prędkości przewijania tekstu.

Prowadzi to do kilku problemów:

- tekst może uciekać przed prezenterem
- prezenter zaczyna nieświadomie przyspieszać
- wypowiedź brzmi mniej naturalnie
- znalezienie odpowiedniej prędkości wymaga kilku prób
- pauzy zaburzają klasyczne przewijanie
- drobna improwizacja może spowodować utratę miejsca
- pomyłka może wymagać ręcznego szukania fragmentu
- często potrzebna jest druga osoba sterująca teleprompterem
- część dostępnych aplikacji ma przestarzały lub zbyt skomplikowany UI

Produkt ma odwrócić tę relację.

To **teleprompter dostosowuje się do sposobu mówienia prezentera**, a nie prezenter do telepromptera.

---

# 4. Target User

## Primary Persona — Professional Presenter

Osoba regularnie występująca przed kamerą i korzystająca z wcześniej przygotowanych skryptów.

Może być:

- prezenterem
- dziennikarzem
- reporterem
- prowadzącym format wideo
- twórcą materiałów firmowych
- członkiem niewielkiej ekipy produkcyjnej
- operatorem przygotowującym teleprompter dla prowadzącego

Primary use case zakłada użytkownika, który **samodzielnie obsługuje teleprompter**.

Obsługa przez drugą osobę zostanie rozwinięta później poprzez Companion Remote.

---

# 5. User Needs

Użytkownik potrzebuje:

- szybko wkleić przygotowany tekst
- rozpocząć pracę bez skomplikowanej konfiguracji
- czytać we własnym tempie
- robić naturalne pauzy
- lekko improwizować
- powtarzać fragmenty po pomyłce
- szybko odnaleźć właściwe miejsce
- utrzymać wzrok w odpowiednim obszarze ekranu
- mieć możliwość ręcznego przejęcia kontroli
- używać telepromptera bez internetu
- mieć pewność, że skrypt i głos nie są wysyłane do zewnętrznych serwerów
- korzystać z aplikacji bez generowania kosztów API

---

# 6. Jobs To Be Done

## Functional JTBD

Kiedy mam przygotowany tekst i zaczynam nagranie, chcę uruchomić teleprompter, który sam dopasuje się do mojego tempa, żebym mógł skoncentrować się na sposobie mówienia zamiast na sterowaniu tekstem.

## Emotional JTBD

Chcę czuć, że kontroluję nagranie i mogę mówić naturalnie, bez obawy, że tekst zaraz mi ucieknie.

## Professional JTBD

Chcę ograniczyć liczbę dubli i błędów wynikających z niewłaściwego działania telepromptera.

---

# 7. Primary Product Outcomes

## 7.1 Naturalniejsza wypowiedź

Prezenter nie musi dopasowywać tempa mówienia do scrolla.

## 7.2 Mniej dubli

Teleprompter nie powinien być przyczyną powtarzania nagrania.

---

# 8. Value Proposition

### Primary

> **Speak naturally. Your script follows.**

### Supporting idea

> **It knows where you are.**

Smart Follow nie powinien być komunikowany jedynie jako automatyczne dopasowywanie prędkości.

System ma rozumieć **pozycję prezentera w skrypcie**.

---

# 9. Design Principles

## 9.1 The interface disappears when the presenter starts speaking

Przed rozpoczęciem pracy interfejs pozwala skonfigurować teleprompter.

Po rozpoczęciu nagrania UI powinno praktycznie zniknąć.

Tekst staje się najważniejszym elementem ekranu.

## 9.2 Natural speech over perfect script matching

Smart Follow nie wymaga czytania słowo w słowo.

System powinien tolerować:

- drobne przeformułowania
- dodatkowe słowa
- niewielkie pominięcia
- naturalne powtórzenia
- krótkie improwizacje
- pauzy

## 9.3 Manual control always wins

AI pomaga użytkownikowi, ale nigdy nie odbiera mu kontroli.

Każda ręczna interakcja ma pierwszeństwo przed Smart Follow.

## 9.4 Professional control without professional complexity

Produkt może oferować profesjonalne możliwości, ale użytkownik nie powinien być zmuszany do ustawiania technicznych parametrów.

Preferujemy:

**Close / Standard / Distance**

zamiast:

**Font size / Line height / Text width**

## 9.5 Fail gracefully

Awaria funkcji AI nie może oznaczać awarii całego telepromptera.

## 9.6 Offline by default

Podstawowa sesja telepromptera powinna być możliwa bez aktywnego połączenia z internetem.

## 9.7 Zero-cost core

Żadna kluczowa funkcja produktu nie może zależeć od płatnego API, tokenów lub abonamentu.

---

# 10. Core User Flow

```text
OPEN APP
   ↓
PASTE SCRIPT
   ↓
CONTINUE
   ↓
SETUP
   ↓
START PROMPT
   ↓
OPTIONAL SMART FOLLOW CALIBRATION
   ↓
PROMPT MODE
   ↓
EXIT
   ↓
SCRIPT EDITOR
```

Dla powracającego użytkownika idealny flow powinien sprowadzać się do:

**Paste → Continue → Start**

---

# 11. Information Architecture

```text
PROMPTR

Script
├── Editor
├── Bold
└── Pause

Setup
├── Close
├── Standard
├── Distance
├── Smart Follow
├── Mirror
└── Reading Marker

Calibration
└── Personal pace

Prompt
├── Smart Follow
├── Manual Mode
├── Focus Zone
├── Recovery
└── Controls
```

MVP posiada cztery główne widoki:

1. Script Editor
2. Setup
3. Calibration
4. Prompt Mode

---

# 12. Screen 1 — Script Editor

Script Editor jest jednocześnie ekranem startowym aplikacji.

Nie tworzymy osobnego dashboardu ani landing page wewnątrz produktu.

## Empty State

Głównym elementem ekranu jest duże pole:

**Paste your script**

Placeholder:

**Paste or start typing…**

Primary CTA:

**Continue**

Interfejs powinien mieć dużo pustej przestrzeni i minimalną liczbę elementów.

---

# 13. Script Editing

Użytkownik może:

- wkleić tekst
- pisać bezpośrednio w aplikacji
- edytować tekst
- pogrubić wybrane fragmenty
- wstawić marker PAUSE

Nie implementujemy rozbudowanego rich text editora.

---

# 14. Autosave

Skrypt jest automatycznie zapisywany lokalnie.

Brak przycisku:

**Save**

Brak modalnego pytania:

**Do you want to save your changes?**

MVP przechowuje tylko **ostatni używany skrypt**.

---

# 15. Bold

Użytkownik może pogrubić wybrane słowa lub fragmenty.

Formatowanie pozostaje widoczne podczas Prompt Mode.

Przykład:

> To jest **naprawdę** ważna informacja.

Celem funkcji jest pomoc w intonacji i akcentowaniu wypowiedzi.

---

# 16. PAUSE Marker

Edytor pozwala wstawić jeden uniwersalny marker:

**PAUSE**

W MVP nie występują:

- short pause
- long pause
- camera markers
- custom markers

PAUSE ma dwa zadania.

## Wizualne

W Prompt Mode informuje prezentera o planowanej przerwie.

Preferowana reprezentacja:

**• • •**

zamiast literalnego `[PAUSE]`.

## Funkcjonalne

Smart Follow wie, że w tym miejscu cisza jest spodziewanym zachowaniem.

PAUSE oznacza:

> **permission to pause**

Nie oznacza:

> **stop for X seconds**

---

# 17. Screen 2 — Setup

Setup jest pojedynczym ekranem.

Nie stosujemy wieloetapowego wizarda.

Użytkownik powinien widzieć live preview wyglądu telepromptera.

---

# 18. Reading Presets

MVP posiada trzy presety.

## Close

Urządzenie znajduje się blisko prezentera.

## Standard

Domyślne zastosowanie.

## Distance

Prezenter znajduje się dalej od urządzenia.

Preset automatycznie kontroluje:

- rozmiar tekstu
- wysokość linii
- szerokość kolumny
- odstępy

W MVP użytkownik nie ustawia tych wartości ręcznie.

---

# 19. Setup Options

Ekran Setup zawiera:

### Reading distance

`Close | Standard | Distance`

### Smart Follow

`On / Off`

Domyślnie:

**ON**

### Mirror

`On / Off`

### Reading Marker

`On / Off`

### CTA

**Start Prompt**

---

# 20. Focus Zone

Aktualnie czytany fragment powinien znajdować się w okolicy:

**35–45% wysokości ekranu**

Domyślna pozycja:

około **40%**.

Focus Zone nie powinna być przedstawiona jako widoczny prostokąt.

Użytkownik powinien ją odczuwać poprzez pozycjonowanie tekstu.

---

# 21. Elastic Focus Zone

Smart Follow nie przykleja aktualnego słowa do jednej pozycji.

System wykorzystuje elastyczny obszar około 35–45% wysokości ekranu.

Dopóki aktualny fragment pozostaje w tej strefie, scroll wykonuje minimalne korekty.

Kiedy tekst zaczyna wychodzić poza Focus Zone, system łagodnie przesuwa dokument.

Celem jest ograniczenie:

- drgań
- mikroprzesunięć
- nerwowego scrollowania
- efektu karaoke

---

# 22. Reading Marker

Reading Marker jest funkcją opcjonalną.

Może być przedstawiony jako subtelny element przy lewej stronie Focus Zone.

Przykład:

```text
      poprzedni tekst

  ›   Aktualnie czytany fragment
      aktualnie czytany fragment

      kolejny tekst
```

Marker pomaga szybko odnaleźć punkt czytania po chwilowym odwróceniu wzroku.

---

# 23. Smart Follow — Core Concept

Smart Follow jest głównym USP produktu.

Nie jest to klasyczny automatic scrolling.

System odpowiada na pytanie:

> **W którym miejscu skryptu znajduje się aktualnie prezenter?**

Oddzielny Smooth Follow Engine odpowiada za:

> **Jak płynnie przesunąć tekst, aby odpowiedni fragment pozostał w Focus Zone?**

Te dwa systemy powinny być logicznie rozdzielone.

---

# 24. Smart Follow — Conceptual Pipeline

```text
Microphone
   ↓
Local audio buffer
   ↓
On-device speech recognition
   ↓
Temporary transcript
   ↓
Local script matching
   ↓
Current script position
   ↓
Confidence
   ↓
Smooth Follow Engine
   ↓
Elastic Focus Zone
```

---

# 25. Smart Follow — Privacy Model

Smart Follow działa **on-device**.

Domyślnie:

- audio nie jest nagrywane
- audio nie opuszcza urządzenia
- skrypt nie opuszcza urządzenia
- transkrypcja nie jest zapisywana
- temporary transcript istnieje wyłącznie podczas sesji

Dane tymczasowe powinny być usuwane po zakończeniu przetwarzania.

---

# 26. Supported Languages

MVP powinno obsługiwać:

- Polish
- English

Architektura powinna umożliwiać dodawanie kolejnych języków w przyszłości.

---

# 27. Smart Follow Calibration

Przy pierwszym użyciu użytkownik może przejść krótką kalibrację.

Komunikat:

**Let’s match your pace.**

Pod spodem:

**Read this sentence naturally.**

Użytkownik czyta jedno krótkie zdanie.

Po zakończeniu:

**You’re ready.**

Kalibracja:

- jest opcjonalna
- można ją pominąć
- nie pokazuje parametrów technicznych
- nie pokazuje waveformów
- nie wymaga ręcznego ustawiania WPM
- rezultat zapisuje się lokalnie

Smart Follow nadal adaptuje się podczas właściwego czytania.

---

# 28. Smart Follow — Pause Behaviour

Przy krótkiej ciszy tekst nie zatrzymuje się natychmiast.

Preferowane zachowanie:

### 0–0.5 s

normalny lub niemal normalny ruch

### 0.5–1.5 s

płynne wyhamowanie

### 1.5 s+

tekst praktycznie pozostaje nieruchomy

Po ponownym rozpoczęciu wypowiedzi tekst płynnie wraca do ruchu.

Model:

**ease out → hold → ease in**

Nie:

**play → stop → play**

Dokładne wartości wymagają testów użytkowników.

---

# 29. Confidence Model

Smart Follow wykorzystuje wewnętrzne poziomy pewności.

## High Confidence

System dobrze zna pozycję użytkownika.

Normalne działanie.

## Medium Confidence

Wypowiedź odbiega od skryptu, ale system nadal zna przybliżoną pozycję.

Scroll zwalnia i zachowuje się bardziej konserwatywnie.

UI nadal pokazuje:

**Following**

## Low Confidence

System nie jest pewny aktualnej pozycji.

Scroll płynnie wyhamowuje.

Status:

**Finding your place…**

Jeżeli pozycja nie zostanie odnaleziona:

**Smart Follow paused**

---

# 30. Stability Principle

Smart Follow powinien preferować:

> **stability over instant reaction**

Fałszywy skok tekstu jest bardziej szkodliwy niż niewielkie opóźnienie.

Jeżeli system nie ma wystarczającej pewności, powinien poczekać na więcej danych zamiast gwałtownie zmieniać pozycję.

---

# 31. Natural Language Matching

Smart Follow nie wymaga dokładnego dopasowania tekstu.

Skrypt:

> Dzisiaj premier przedstawił nowy program mieszkaniowy.

Prezenter:

> Dziś rano premier przedstawił zupełnie nowy program dotyczący mieszkalnictwa.

System powinien rozpoznać, że użytkownik nadal znajduje się w tym samym fragmencie.

Matching powinien brać pod uwagę:

- rozpoznane słowa
- znaczenie wypowiedzi
- kolejność fragmentów
- aktualną pozycję
- najbliższy kontekst
- poprzednie dopasowania

---

# 32. Local Context Priority

Smart Follow nie powinien przeszukiwać całego skryptu przy każdym rozpoznanym fragmencie.

Jeżeli użytkownik znajduje się w określonym miejscu dokumentu, system preferuje:

**current position ± nearby context**

Dopiero przy utracie pozycji zakres wyszukiwania zostaje zwiększony.

Zmniejsza to ryzyko błędnego dopasowania wypowiedzi innych osób obecnych na planie.

---

# 33. Backtracking

Prezenter może pomylić się i powtórzyć część zdania.

Przykład:

> Dzisiejsze… przepraszam. Dzisiejsze spotkanie rozpoczynamy…

Smart Follow powinien pozwalać na niewielki ruch wstecz.

System nie przewija automatycznie dalej tylko dlatego, że dany fragment został już wcześniej rozpoznany.

---

# 34. Skipping Content

Prezenter może świadomie pominąć:

- zdanie
- kilka zdań
- cały akapit

Jeżeli Smart Follow z wystarczającą pewnością odnajdzie dalszą część skryptu, powinien łagodnie przejść do nowej pozycji.

Użytkownik nie jest zmuszany do przeczytania całego dokumentu.

---

# 35. Long Silence

Długa cisza nie jest błędem.

Smart Follow pozostawia tekst nieruchomy.

Status może nadal wskazywać:

**Following**

Dopiero kiedy użytkownik ponownie zaczyna mówić i system nie może odnaleźć pozycji, pojawia się:

**Finding your place…**

Zasada:

> **Silence ≠ lost position**

---

# 36. Recovery

Jeżeli Smart Follow zgubi pozycję:

1. scroll łagodnie się zatrzymuje
2. pojawia się `Finding your place…`
3. jeżeli system nie odzyska pozycji, pojawia się `Smart Follow paused`
4. użytkownik widzi instrukcję `Tap the line you're reading`
5. użytkownik dotyka właściwego zdania
6. wybrane zdanie trafia do Focus Zone
7. Smart Follow automatycznie wznawia działanie

Nie wyświetlamy:

- modalnych okien
- confirmation dialogów
- przycisku Resume po tapnięciu
- error screen

Recovery powinno wymagać **jednej interakcji**.

---

# 37. Manual Override

Ręczna interakcja zawsze posiada pierwszeństwo nad Smart Follow.

Jeżeli użytkownik ręcznie przesuwa tekst:

1. Smart Follow chwilowo przestaje kontrolować pozycję
2. użytkownik przesuwa dokument
3. system próbuje odnaleźć nową aktualną pozycję
4. Smart Follow ponownie zaczyna podążać za wypowiedzią

AI nigdy nie powinno walczyć ze scrollowaniem wykonywanym przez użytkownika.

---

# 38. Smart Follow Status

Status powinien być subtelny.

Podstawowe stany:

### Normal

**● Following**

### Searching

**Finding your place…**

### Lost

**Smart Follow paused**

Podczas zwykłej pauzy nie pokazujemy dodatkowego statusu.

Nie pokazujemy użytkownikowi:

- confidence %
- live transcription
- speech accuracy
- technical diagnostics

---

# 39. Smooth Follow Engine

Smooth Follow Engine odpowiada wyłącznie za płynne pozycjonowanie tekstu.

Nie odpowiada za rozpoznawanie mowy.

Smart Follow określa:

> **gdzie znajduje się użytkownik**

Smooth Follow określa:

> **jak płynnie przesunąć tekst do odpowiedniego miejsca**

Silnik powinien działać lokalnie i bez płatnych bibliotek.

Preferowane technologie:

- `requestAnimationFrame`
- CSS transforms
- interpolation
- easing
- velocity smoothing
- własny stan pozycji scrolla

Nie ma potrzeby używania komercyjnego silnika animacji.

---

# 40. Smooth Follow Behaviour

Ruch tekstu powinien:

- być płynny
- unikać gwałtownych skoków
- posiadać naturalne przyspieszanie
- posiadać naturalne wyhamowanie
- reagować na pozycję, a nie na każde pojedyncze słowo
- zachowywać stabilność Focus Zone
- nie tworzyć efektu karaoke

Gdy Smart Follow otrzyma nową pozycję docelową, Smooth Follow Engine powinien interpolować pomiędzy aktualną a docelową pozycją.

---

# 41. Screen 3 — Prompt Mode

Prompt Mode jest najważniejszym ekranem produktu.

Domyślnie ekran zawiera niemal wyłącznie tekst.

Aktualny fragment znajduje się w Focus Zone.

Pozostały tekst może posiadać niższy wizualny priorytet.

Przykład:

```text
          wcześniejszy fragment


      Dzisiejsze spotkanie
      rozpoczniemy od najważniejszych
      wydarzeń ostatnich godzin.


          kolejny fragment



                         ● Following
```

UI nie powinno konkurować z tekstem o uwagę.

---

# 42. Prompt Controls

Kontrolki są domyślnie ukryte.

Tapnięcie ekranu pokazuje prosty zestaw sterowania.

Podstawowe controls:

- slower
- play / pause
- faster
- Smart Follow ON/OFF
- Exit

Po krótkim czasie bez interakcji controls automatycznie znikają.

---

# 43. Manual Mode

Smart Follow można całkowicie wyłączyć.

Po wyłączeniu aplikacja działa jak klasyczny teleprompter.

Manual Mode posiada:

- Play
- Pause
- Slower
- Faster
- manual scroll

Manual Mode pełni również rolę fallbacku.

Produkt musi pozostać użyteczny nawet wtedy, gdy Smart Follow nie działa.

---

# 44. Microphone Permission

Jeżeli Smart Follow nie posiada dostępu do mikrofonu:

**Smart Follow needs microphone access**

Supporting text:

**Your audio is processed on this device and isn't recorded.**

Actions:

**Allow microphone**

oraz:

**Use manual mode**

Brak zgody na mikrofon nigdy nie blokuje używania telepromptera.

---

# 45. Microphone Failure During Session

Jeżeli mikrofon przestanie działać podczas Prompt Mode:

1. Smart Follow płynnie zatrzymuje automatyczne śledzenie
2. pojawia się `Microphone unavailable`
3. manual controls pozostają dostępne
4. sesja nie zostaje zamknięta

Zasada:

> **Graceful degradation instead of product failure.**

---

# 46. Mirror Mode

MVP obsługuje horizontal mirror.

Mirror działa wyłącznie w Prompt Mode.

Ekrany Editor, Setup i Calibration pozostają wyświetlane normalnie.

---

# 47. PWA Requirements

Aplikacja jest Progressive Web App.

Powinna:

- umożliwiać instalację na ekranie głównym
- działać w trybie standalone
- posiadać Web App Manifest
- wykorzystywać Service Worker
- cachować podstawowe assety
- działać offline po wcześniejszym uruchomieniu
- szybko się uruchamiać
- zachowywać ostatni skrypt lokalnie

---

# 48. Offline-first Requirement

Podstawowa zasada:

> **An active internet connection must never be required to run a prepared prompt.**

Offline muszą działać:

- Script Editor
- ostatni zapisany skrypt
- Setup
- presety
- Mirror
- Reading Marker
- Manual Mode
- Prompt Mode
- PAUSE
- Smooth Follow

Smart Follow również powinien działać lokalnie.

---

# 49. Wake Lock

Podczas Prompt Mode aplikacja powinna korzystać z Screen Wake Lock API tam, gdzie jest ono dostępne.

Ekran nie powinien automatycznie wygasić się podczas sesji.

Jeżeli Wake Lock API jest niedostępne, aplikacja nadal działa i nie wyświetla blokującego błędu.

---

# 50. Device Priority

Projektujemy przede wszystkim:

### 1. Tablet

Primary viewport.

### 2. Smartphone

Pełna obsługa.

### 3. Laptop / Desktop

Pełna obsługa, szczególnie podczas przygotowania skryptu.

Produkt powinien być projektowany:

> **tablet-first**

a nie wyłącznie mobile-first.

---

# 51. Orientation

Prompt Mode powinien działać zarówno:

- portrait
- landscape

Aplikacja nie wymusza jednej orientacji.

Layout reaguje na aktualny viewport.

---

# 52. Accessibility

Minimum dla MVP:

- wysoki kontrast tekstu
- duże touch targety
- czytelna hierarchia
- skalowalna typografia
- statusy nieprzekazywane wyłącznie kolorem
- obsługa klawiatury na desktopie
- respektowanie `prefers-reduced-motion` dla animacji UI

Ruch tekstu telepromptera jest jednak podstawową funkcją produktu i nie powinien zostać automatycznie wyłączony przez `prefers-reduced-motion`.

---

# 53. Zero-Cost Technology Requirement

Podstawowe działanie produktu nie może wymagać:

- płatnych API
- usług SaaS rozliczanych per request
- kupowania tokenów
- abonamentów
- płatnych bibliotek
- płatnych modeli speech-to-text
- zewnętrznego cloud inference

Core Experience powinien być możliwy do uruchomienia bez kosztów zależnych od liczby użytkowników lub długości sesji.

Zasada:

> **The core product must not depend on paid APIs or usage-based external services.**

---

# 54. Zero-Cost Smart Follow

Smart Follow musi działać bez obowiązkowego płatnego API.

Preferowana architektura:

```text
Microphone
   ↓
Local audio processing
   ↓
Open-source on-device speech recognition
   ↓
Temporary transcript
   ↓
Local script matching
   ↓
Position confidence
   ↓
Smooth Follow Engine
```

Koszt pojedynczej sesji po stronie AI/API:

> **0 zł**

---

# 55. Local Speech Recognition

Preferowanym kierunkiem jest wykorzystanie otwartego, lokalnego modelu speech-to-text.

Rekomendowany kierunek badawczy dla MVP:

**Whisper multilingual**

działający lokalnie poprzez:

- WebAssembly jako podstawowy runtime
- WebGPU jako opcjonalne przyspieszenie tam, gdzie jest dostępne

Aplikacja nie może wymagać WebGPU do podstawowego działania Smart Follow.

WASM powinien stanowić bezpieczną bazę.

---

# 56. Speech Recognition Goal

Celem Smart Follow nie jest stworzenie perfekcyjnej transkrypcji wypowiedzi.

Głównym zadaniem jest:

> **ustalenie aktualnej pozycji użytkownika w skrypcie**

Dlatego system powinien być optymalizowany pod:

- latency
- stabilność
- małe zużycie pamięci
- wydajność na tabletach
- analizę krótkich fragmentów
- szybkie lokalne dopasowanie

a nie pod perfekcyjną transkrypcję całej sesji.

---

# 57. Streaming / Chunk Strategy

Audio nie powinno być analizowane jako jedno długie nagranie.

Preferowane podejście:

```text
audio chunk
   ↓
local speech recognition
   ↓
short phrase
   ↓
local script matching
   ↓
position update
```

System może wykorzystywać krótkie przesuwające się okna audio.

Po wykorzystaniu tymczasowej transkrypcji nie ma potrzeby jej przechowywania.

---

# 58. Preferred Free Technology Stack

Rekomendowany kierunek MVP:

### Frontend

**React**

### Language

**TypeScript**

### Build Tool

**Vite**

### Styling

Preferowane rozwiązanie bez płatnej zależności, np.:

- CSS Modules
- Tailwind CSS
- własny CSS

### PWA

- Web App Manifest
- Service Worker

### Local persistence

**IndexedDB**

Dla prostych preferencji możliwy również:

**localStorage**

### Audio Capture

- `MediaDevices`
- Web Audio API

### Speech Recognition

Lokalny, otwarty model speech-to-text.

Preferowany kierunek:

**Whisper multilingual**

### ML Runtime

- WebAssembly
- opcjonalnie WebGPU

Możliwe narzędzia do dalszych testów:

- whisper.cpp / WASM
- Transformers.js
- ONNX Runtime Web

Ostateczny wybór powinien wynikać z benchmarków na docelowych tabletach.

### Smooth Follow

- `requestAnimationFrame`
- CSS transforms
- własna interpolacja i easing

### Hosting

Aplikacja powinna móc działać jako statyczna aplikacja webowa.

Backend nie jest wymagany dla Core MVP.

---

# 59. Dependency Policy

Każda nowa biblioteka powinna zostać sprawdzona przed dodaniem do projektu.

Należy zweryfikować:

1. licencję
2. możliwość wykorzystania komercyjnego
3. obowiązek abonamentu
4. limity darmowego planu
5. zależność od API zewnętrznego
6. działanie offline
7. wpływ na prywatność
8. rozmiar bundle
9. wpływ na wydajność urządzeń mobilnych

Preferowane licencje:

- MIT
- Apache 2.0
- BSD

Należy unikać sytuacji, w której krytyczna funkcja jest uzależniona od darmowego planu komercyjnej platformy.

---

# 60. Infrastructure Independence

Po pobraniu wymaganych assetów aplikacja powinna móc przeprowadzić pełną sesję telepromptera bez komunikacji z backendem.

Dotyczy to:

- edycji skryptu
- Smart Follow
- Smooth Follow
- Prompt Mode
- Manual Mode
- PAUSE
- Focus Zone
- ustawień
- lokalnego zapisu

Backend nie jest wymaganiem podstawowego MVP.

---

# 61. Hosting Cost Principle

Hosting samej aplikacji może w przyszłości generować koszty infrastrukturalne przy dużej skali, jednak architektura produktu nie może generować kosztu AI za każdą sesję.

Priorytet:

> **No per-minute, per-token or per-request cost for Smart Follow.**

---

# 62. First Aha Moment

Najważniejszy moment podczas pierwszego użycia powinien wyglądać następująco:

1. użytkownik rozpoczyna czytanie
2. Smart Follow podąża za tekstem
3. użytkownik naturalnie zatrzymuje się
4. tekst łagodnie zwalnia
5. użytkownik kontynuuje wypowiedź
6. tekst ponownie zaczyna podążać

Oczekiwana reakcja:

> **Nie muszę pilnować scrolla.**

Ten moment powinien nastąpić możliwie wcześnie podczas pierwszej sesji.

---

# 63. MVP Scope

MVP zawiera:

- Progressive Web App
- tablet-first responsive UI
- Paste Script
- Script Editor
- Bold
- PAUSE
- lokalny autosave
- ostatni skrypt
- Close preset
- Standard preset
- Distance preset
- Smart Follow ON/OFF
- on-device speech recognition
- Polish Smart Follow
- English Smart Follow
- optional calibration
- Focus Zone
- Elastic Focus Zone
- Smooth Follow
- Reading Marker ON/OFF
- horizontal Mirror Mode
- manual override
- Smart Follow recovery
- Manual Mode
- Play / Pause
- Slower / Faster
- fullscreen Prompt Mode
- Screen Wake Lock
- offline support
- zero-cost Smart Follow architecture

---

# 64. Explicitly Out of Scope — MVP

MVP nie zawiera:

- kont użytkownika
- cloud sync
- folderów
- projektów
- historii wielu skryptów
- video recording
- audio recording
- montażu
- AI script writera
- importu Google Docs
- zaawansowanego rich text editora
- ręcznej konfiguracji line height
- ręcznej konfiguracji text width
- ręcznej konfiguracji font size
- custom markers
- Bluetooth remote
- multi-device sync
- Companion Remote
- statystyk sesji
- profili prezenterów
- płatnych API AI
- płatnego speech-to-text
- obowiązkowego backendu

---

# 65. MVP Hypothesis

MVP ma odpowiedzieć przede wszystkim na jedno pytanie:

> **Czy Smart Follow pozwala użytkownikowi czytać bardziej naturalnie niż klasyczny teleprompter oparty na ręcznie ustawionej prędkości?**

Jeżeli odpowiedź brzmi „tak”, główna hipoteza produktu została potwierdzona.

---

# 66. Success Metrics

## Manual Intervention Rate

Liczba ręcznych korekt pozycji podczas sesji.

**Im mniej, tym lepiej.**

## Smart Follow Recovery Rate

Procent sytuacji, w których:

- Smart Follow sam odzyskał pozycję

lub

- użytkownik odzyskał pozycję pojedynczym tapnięciem

## First Prompt Time

Czas od otwarcia aplikacji do uruchomienia Prompt Mode.

Target dla powracającego użytkownika:

**< 30 sekund**

## Smart Follow Usage Rate

Procent sesji prowadzonych z aktywnym Smart Follow.

Jeżeli użytkownicy regularnie wyłączają tę funkcję, należy zbadać przyczynę.

## Completion Without Intervention

Procent sesji zakończonych bez konieczności ręcznego ratowania pozycji tekstu.

Potencjalna główna:

**North Star Metric**

---

# 67. Metrics We Do Not Optimize For

Nie optymalizujemy:

**Time in app**

Długi czas spędzony w produkcie nie oznacza sukcesu.

Idealny scenariusz:

**Open → Paste → Prompt → Exit**

Teleprompter jest narzędziem, a nie platformą angażującą użytkownika.

---

# 68. V1 Roadmap

Pierwszym dużym rozwinięciem po potwierdzeniu działania MVP powinien być:

## Companion Remote

Jedno urządzenie pełni rolę telepromptera.

Drugie urządzenie staje się pilotem.

Pairing:

**Scan QR → Connected**

Bez obowiązkowego konta.

Remote powinien pokazywać:

- aktualny fragment tekstu
- Play / Pause
- Previous
- Next
- speed adjustment
- status Smart Follow
- możliwość odzyskania pozycji

Companion może być używany przez:

- operatora
- realizatora
- drugą osobę na planie
- samego prezentera

---

# 69. Other V1 Candidates

Poza Companion Remote:

- historia skryptów
- zaawansowane ustawienia typografii
- keyboard shortcuts
- regulacja Focus Zone
- saved presets
- lepsza obsługa Bluetooth
- rozszerzone opcje Wake Lock
- dodatkowe opcje wyświetlania

---

# 70. V2 Roadmap

Potencjalne funkcje:

- custom markers
- CAMERA marker
- NEXT marker
- presenter profiles
- personal pace learning
- automatyczne uczenie preferencji użytkownika
- Bluetooth remote support
- multi-device sessions
- saved setup presets
- import dokumentów
- kolejne języki
- rozszerzone modele on-device
- session statistics

V2 powinno wynikać z obserwacji realnego użycia produktu, a nie z chęci rozbudowywania feature setu.

---

# 71. Core Product Principles Summary

Produkt powinien zawsze spełniać sześć zasad.

### 1. Speak naturally

Prezenter dyktuje tempo teleprompterowi.

### 2. Stay focused

Tekst pozostaje w naturalnej Focus Zone.

### 3. Never fight the user

Manual control zawsze wygrywa z AI.

### 4. Fail gracefully

Awaria Smart Follow nie oznacza awarii telepromptera.

### 5. Disappear

Podczas nagrania interfejs staje się niemal niewidoczny.

### 6. Stay independent

Core Experience działa lokalnie, offline i bez płatnych API.

---

# 72. Definition of MVP Success

MVP można uznać za udane, jeżeli podczas testów z realnymi prezenterami:

1. użytkownicy są w stanie rozpocząć Prompt Mode bez instrukcji
2. większość rozumie trzy presety bez dodatkowych wyjaśnień
3. Smart Follow utrzymuje odpowiednią pozycję podczas normalnej wypowiedzi
4. naturalna pauza nie powoduje dezorientacji systemu
5. niewielka improwizacja nie powoduje utraty pozycji
6. powtórzenie fragmentu nie powoduje niekontrolowanego przeskoku
7. użytkownik może odzyskać pozycję jednym tapnięciem
8. manual override działa natychmiast
9. ruch tekstu jest płynny i stabilny
10. użytkownik nie czuje potrzeby ciągłego kontrolowania scrolla
11. aplikacja pozostaje użyteczna przy wyłączonym Smart Follow
12. użytkownicy preferują Smart Follow względem klasycznego ustawienia stałej prędkości
13. podstawowa sesja może zostać przeprowadzona offline
14. Smart Follow nie wymaga płatnego API
15. żadna sesja nie generuje kosztu speech-to-text po stronie zewnętrznej usługi

---

# 73. Technical Validation Priorities

Przed rozpoczęciem pełnej implementacji należy wykonać techniczny proof of concept Smart Follow.

Najważniejsze pytania:

### 1. Performance

Czy lokalny model speech-to-text może działać wystarczająco szybko na typowym tablecie?

### 2. Latency

Jak duże opóźnienie występuje między wypowiedzeniem fragmentu a uzyskaniem wystarczającego dopasowania?

### 3. Model size

Jaki rozmiar modelu zapewnia najlepszy kompromis między:

- szybkością
- zużyciem pamięci
- download size
- dokładnością

### 4. Polish language quality

Czy wybrany model wystarczająco dobrze rozpoznaje polski do lokalizowania użytkownika w skrypcie?

### 5. English language quality

Czy ten sam pipeline działa poprawnie po angielsku?

### 6. Safari / iPadOS

Czy Smart Follow osiąga akceptowalną wydajność na iPadzie bez obowiązkowego WebGPU?

### 7. Long scripts

Czy matching pozostaje stabilny przy dłuższych materiałach?

---

# 74. Recommended Development Order

## Phase 1 — Manual Teleprompter

Najpierw zbudować:

- Script Editor
- presets
- Prompt Mode
- Focus Zone
- Manual Mode
- Smooth Follow
- Mirror
- PAUSE
- local persistence
- PWA
- offline mode

Bez AI.

Celem jest dopracowanie podstawowego UX telepromptera.

## Phase 2 — Smart Follow Proof of Concept

Oddzielnie zbudować eksperymentalny pipeline:

```text
Microphone
→ speech recognition
→ transcript chunk
→ local script matching
→ current position
```

Bez dopracowanego UI.

Celem jest potwierdzenie technologii.

## Phase 3 — Smart Follow Integration

Połączyć wynik pozycji ze Smooth Follow Engine.

Dodać:

- confidence
- pause behaviour
- recovery
- manual override

## Phase 4 — Device Optimization

Testować przede wszystkim:

- iPad
- Android tablet
- iPhone
- Android phone
- desktop Safari
- Chrome

## Phase 5 — User Testing

Testować produkt z realnymi prezenterami i materiałami o różnej długości.

---

# 75. Product North Star

Całą koncepcję produktu można sprowadzić do jednego zdania:

> **The presenter shouldn't follow the teleprompter. The teleprompter should follow the presenter.**