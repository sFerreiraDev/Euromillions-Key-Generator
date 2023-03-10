'use strict';

/**
 * STATE HANDLER
 */

const getStateToSave = (flatKey) => {
    const now = new Date();
    return JSON.stringify({ lastKey: flatKey, date: now.toDateString() });
}

const getDataFromState = (state) => {
    return JSON.parse(state);
}

const getKeyFromState = (state) => {
    const maybeKey = getDataFromState(state)?.lastKey;
    return maybeKey;
}

/**
 * STORAGE SERVICE
 */

const getData = (path) => {
    return localStorage.getItem(path);
}

const setData = (path, data) => {
    localStorage.setItem(path, data);
}

/**
 * DATA FETCHER ADAPTER
 */
function getStatisticData(selector) {
    const SPLITTER = '|';
    let tableData = document.getElementsByClassName(selector);
    if (!tableData.length) return null;
    return [...tableData].reduce((acc, tableElem, i) => {
        const tableData = [...tableElem.children].map(row => row.innerHTML.trim().replace(/<li>/g, '').replace(/<\/li>/g, SPLITTER))
        
        return {...acc, [i === 0 ? 'numbersData' : 'starsData']: tableData.map(rowData => createRow(rowData.split(SPLITTER)))};
    }, {});
}

function createRow(rowData) {
    return {
        number: +rowData[0],
        totalDrawTimes: +rowData[1],
        totalDrawTimesPercentage: Number(rowData[2].replace(',', '.')),
        lastDrawId: rowData[3],
        lastDrawDate: stringToDate(rowData[4]),
        missingDraws: +rowData[5],
    }
}

/**
 * UI LOGIC
 */
function createMainContainer(body, id) {
    const ID = id;

    let elem = document.createElement('div');

    elem.id = ID;
    elem.classList.add('flex-center')

    body.appendChild(elem);
    return elem;
} 

function createWrapper(mainElem, wrapperClass, clickFn) {
    const wrapper = document.createElement('div');
    wrapper.classList.add(...['flex-center', wrapperClass])

    wrapper.addEventListener('click', clickFn);

    mainElem.appendChild(wrapper);
    return wrapper;
}

function createNumberContainer(mainElem, id) {
    const CLASS = id.substring(0, id.length - 1);

    let elem = document.createElement('div');
    elem.id = id;
    elem.classList.add(...['flex-center', CLASS]);

    mainElem.appendChild(elem);
    return elem
} 

function addStyles(elem, styles) {
    Object.entries(styles).forEach(([prop, value]) => elem.style[prop] = value);
}

const wrapperClickHandler = (mainElem, statisticsSource, storageKey) => {
    localStorage.removeItem(storageKey);
    if (window.location.href !== statisticsSource) {
        window.location.href = statisticsSource;
    } else {
        appendKey(mainElem);
    }
}

/**
 * "BUSINESS" LOGIC
 * 
 * data type:
 * 
 * type ValueData = {
 *       number: number,
 *       totalDrawTimes: number,
 *       totalDrawTimesPercentage: number      
 *       lastDrawId: number
 *       lastDrawDate: Date
 *       missingDraws: number
 * }
 * 
 * type AllData {
 *   numbersData: Array<ValueData>,
 *   starsData: Array<ValueData>,
 * }
 */
function gemerateKey(allData, howManyNumbers, howManyStars)  {
    if (!allData) return [];
    const result = Object.entries(allData).reduce((acc, [key, data]) => {
        // create the magic bag
        const magicBag = createMagicBag(data);
        
        // check for errors
        const errMsg = isMagicBagOk(magicBag, data);
        if (errMsg) throw errMsg;

        // pick values
        const pickHowMany = key === 'numbersData' ? howManyNumbers : howManyStars
        const pickedValues = getNDiffValuesFromMagicBag(magicBag, pickHowMany);
        return [...acc, pickedValues];
    }, []);
    return result
}

// Here it will be possible to see how much I understand about statistics!
// TODO: if nothing better todo, refactor this code!
function createMagicBag(valuesData) {
    const MAX_NUMBER = valuesData.reduce((max, nextRow) => nextRow.number > max ? nextRow.number : max, 0)
    const MIN_DRAW_PERCENTAGE = valuesData.reduce((min, nextRow) => nextRow.totalDrawTimesPercentage < min ? nextRow.totalDrawTimesPercentage : min, 100)
    
    // I divide the avg by 2 because it gives more balanced percentages
    const missingDrawsAvg = valuesData.reduce((sum, nextRow) => sum + nextRow.missingDraws, 0) / (valuesData.length * 2);
    
    let baseBag = Array.from(new Array(MAX_NUMBER * 10)).map((_, index) => index % MAX_NUMBER + 1);
    valuesData.forEach(valueData => {
        // Change ammounts based on missing draws

        // if a value is missing a lot of draws already this will add up the value more times in the bag OR
        // if the value isn't missing a lot of draws this will also remove some ocurreances of the value
        // the more the value is missing draws the more likely it will been drawn next
        const ammountExtraToAdd = Math.round(valueData.missingDraws - missingDrawsAvg);
        if (ammountExtraToAdd > 0) {
            baseBag.push(...Array.from(Array(ammountExtraToAdd)).map(_ => valueData.number));
        } else if (ammountExtraToAdd < 0) {
            for (let i = 0; i < -ammountExtraToAdd; i++) {
                const nextNumberIndex = baseBag.findIndex((n) => n === valueData.number);
                if (nextNumberIndex > 0) baseBag.splice(nextNumberIndex, 1);
            }
        }

        // Change ammounts based on total draw ammounts

        // if a value has a high ammount of total draws this will remove some of the occurrances from the bag
        // for some reason I just ignore the values that don't have a high ammount of total dras (clearly made by a professional :D)
        const ammountExtraToRemove = Math.round(((valueData.totalDrawTimesPercentage - MIN_DRAW_PERCENTAGE) * 1.5));
        // console.log(ammountExtraToRemove)
        for (let i = 0; i < ammountExtraToRemove; i++) {
            const nextNumberIndex = baseBag.findIndex((n) => n === valueData.number);
            if (nextNumberIndex > 0) baseBag.splice(nextNumberIndex, 1);
        }

        // Guard to make sure there's always at least 1 value of each
        // In reallity, no matter how low the odds are to have one number, it will never be impossible to draw it.
        // So if some of the numbers is missing I just add it. This happens because of how poor the above process is, I know x)
        if (baseBag.findIndex((n) => n === valueData.number) < 0) {
            baseBag.push(valueData.number);
        }
    });
    return shuffle(baseBag);
}

function getMagicBagPercentages(magicBag) {
    const MAX_MAGIC_BAG_NUMBER = magicBag.reduce((max, nextNumber) => nextNumber > max ? nextNumber : max, 0)
    const percentages = Array.from(Array(MAX_MAGIC_BAG_NUMBER + 1)).map(_ => 0);
    magicBag.forEach(n => {
        percentages[n]++;
    });
    return percentages.map(n => Math.round((n / magicBag.length) * 100_00 ) / 100).map((p, n) => [n, p]);
}

function getNDiffValuesFromMagicBag(magicBag, n) {
    const result = [];
    let copy = shuffle([...magicBag]);
    for (let i = 0; i < n; i++) {
        const randomeIndex = getRandomInt(copy.length);
        const value = copy[randomeIndex]
        result.push(value);
        copy = removeAllFromArray(copy,value);
        shuffle(copy);
    }
    return result.sort((a, b) => a - b)
}

/**
 * TESTING OR SOMETHING ALIKE
 */
function isMagicBagOk(magicBag, allRows) {
    return magicBagHasAllValues(magicBag, allRows) ||
           getMagicBagValuesTotalPercentage(magicBag) ||
           '';
}

function magicBagHasAllValues(magicBag, allRows) {
    const magicBagSet = new Set(magicBag);
    if (allRows.length !== magicBagSet.size) {
        console.log(magicBagSet);
        console.log(allRows.map(row => magicBagSet.has(row.number)));
        return 'Not all passible values can be pick.';
    }
    return ''; // OK!
}

function getMagicBagValuesTotalPercentage(magicBag) {
    const percentages = getMagicBagPercentages(magicBag);
    const totalPercentage = percentages.reduce((sum, [n, percetage]) => sum + percetage, 0);
    const PERCENTAGE_ERROR_DELTA_LIMIT = 0.1
    if (totalPercentage < 100 - PERCENTAGE_ERROR_DELTA_LIMIT || totalPercentage > 100 + PERCENTAGE_ERROR_DELTA_LIMIT) {
        console.log('percentages', percentages);
        console.log('totalPercentage', totalPercentage);
        console.log('PERCENTAGE_ERROR_DELTA_LIMIT', PERCENTAGE_ERROR_DELTA_LIMIT);
        return 'Total percetage surpasses the error delta limit.'
    }
    return ''; // OK!
}

/**
 * HELPERS
 */
function shuffle(array) {
    let currentIndex = array.length,  randomIndex;
  
    // While there remain elements to shuffle.
    while (currentIndex != 0) {
  
      // Pick a remaining element.
      randomIndex = Math.floor(Math.random() * currentIndex);
      currentIndex--;
  
      // And swap it with the current element.
      [array[currentIndex], array[randomIndex]] = [
        array[randomIndex], array[currentIndex]];
    }
  
    return array;
}

function getRandomInt(max) {
    return Math.floor(Math.random() * max);
}

function removeAllFromArray(array, value) {
    return array.filter(n => n !== value);
}

// date string should be on format DD/MM/YYYY
function stringToDate(date) {
    const dayMontYear = date.split('/').map(s => +s);
    let result = new Date();
    result.setHours(0,0,0,0);
    result.setDate(dayMontYear[0]);
    result.setMonth(dayMontYear[1] - 1);
    result.setFullYear(dayMontYear[2]);
    return result;
}

/**
 * CONFIGS
 */
const statisticsSourceEuro = 'https://www.jogossantacasa.pt/web/SCEstatisticas/';
const statisticsSourceTotoloto = 'https://www.jogossantacasa.pt/web/SCEstatisticas/totolotoN';
const EURO_STORAGE_KEY = 'euromillions_ext';
const TOTOLOTO_STORAGE_KEY = 'totoloto_ext';
const MAIN_CONTAINER_ID = 'mainContainer';
const MAIN_WRAPPER_CLASS = 'mainWrapper';

/**
 * MAIN
*/
const body = document.getElementsByTagName("body")[0];
const mainElem = createMainContainer(body, MAIN_CONTAINER_ID);
appendKey(mainElem);

function appendKey(mainElem) {
    const isTotoloto = isTotolotoUrl(window.location.href);
    const statisticsSource = isTotoloto ? statisticsSourceTotoloto : statisticsSourceEuro;
    const storageKey = isTotoloto ? TOTOLOTO_STORAGE_KEY : EURO_STORAGE_KEY;

    const mainClickHandlerFn = () => wrapperClickHandler(mainElem, statisticsSource, storageKey)
    const mainElemWrapper = createWrapper(mainElem, MAIN_WRAPPER_CLASS, mainClickHandlerFn);
    
    let flatKey = getFlatKey(isTotoloto, storageKey);
    
    if (!flatKey.length) {
        mainElemWrapper.innerText = `Click here to generate a new key!`
    } else {
        const IDS = ['num1', 'num2', 'num3', 'num4', 'num5', 'star1'];
        if (!isTotoloto) IDS.push('star2');

        IDS.map((id, i) => {
            const elem = createNumberContainer(mainElemWrapper, id);
            elem.innerText = flatKey[i];
            return elem;
        });

        setLastKey(storageKey, flatKey);
    }
}

function getFlatKey(isTotoloto, storageKey) {
    let key = getLastKey(storageKey);

    if (!key) {
        const data = getStatisticData("stripped betMiddle sixcol");
        if (!data) return [];
        const numbersAmount = 5;
        const starsAmount = isTotoloto ? 1 : 2;

        const [nums, stars] = gemerateKey(data, numbersAmount, starsAmount);
        key = [...nums, ...stars];
    }

    return key;
}

function isTotolotoUrl(currentUrl) {
    return currentUrl.toLowerCase().includes('totoloto');
}

function getLastKey(storageKey) {
    const state = getData(storageKey);
    return getKeyFromState(state);
}

function setLastKey(storageKey, flatKey) {
    const newState = getStateToSave(flatKey);
    setData(storageKey, newState);
}