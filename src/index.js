var http = require('http'),
    alexaDateUtil = require('./alexaDateUtil'),
    AlexaSkill = require('./AlexaSkill'),
    APP_ID = 'arn:aws:lambda:us-east-1:878629377403:function:TicketingSystem',  
    MEETUP_KEY = '6247c2c5-061e-4f55-6048-4349c2779';


var url = function(id) {
    return '' + MEETUP_KEY + id;
}

var getJsonFromEB = function(id, callback) {

}
TicketingSystem = function () {
    AlexaSkill.call(this, APP_ID);
};

// Extend AlexaSkill
TicketingSystem.prototype = Object.create(AlexaSkill.prototype);
TicketingSystem.prototype.constructor = TicketingSystem;

TicketingSystem.prototype.eventHandlers.onSessionStarted = function (sessionStartedRequest, session) {
    console.log("onSessionStarted requestId: " + sessionStartedRequest.requestId
        + ", sessionId: " + session.sessionId);
    // any initialization logic goes here
};
TicketingSystem.prototype.eventHandlers.onLaunch = function (launchRequest, session, response) {
    console.log("onLaunch requestId: " + launchRequest.requestId + ", sessionId: " + session.sessionId);
    handleWelcomeRequest(response);
};
TicketingSystem.prototype.eventHandlers.onSessionEnded = function (sessionEndedRequest, session) {
    console.log("onSessionEnded requestId: " + sessionEndedRequest.requestId
        + ", sessionId: " + session.sessionId);
    // any cleanup logic goes here
};

 TicketingSystem.prototype.intentHandlers = {
    "OneshotEventIntent": function (intent, session, response) {
        handleOneshotEventRequest(intent, session, response);
    },

    "DialogEventIntent": function (intent, session, response) {
        // Determine if this turn is for city, for date, or an error.
        // We could be passed slots with values, no slots, slots with no value.
        var citySlot = intent.slots.City;
        var dateSlot = intent.slots.Date;
        if (citySlot && citySlot.value) {
            handleCityDialogRequest(intent, session, response);
        }
    },


    "AMAZON.HelpIntent": function (intent, session, response) {
        handleHelpRequest(response);
    },

    "AMAZON.StopIntent": function (intent, session, response) {
        var speechOutput = "Goodbye";
        response.tell(speechOutput);
    },

    "AMAZON.CancelIntent": function (intent, session, response) {
        var speechOutput = "Goodbye";
        response.tell(speechOutput);
    }
};



function handleWelcomeRequest(response) {
    var whichCityPrompt = "Which city would you like events for?",
        speechOutput = {
            speech: "<speak>Welcome to Tide Pooler. "
                + whichCityPrompt
                + "</speak>",
            type: AlexaSkill.speechOutputType.SSML
        },
        repromptOutput = {
            speech: "For a list of supported cities, ask what cities are supported. "
                + whichCityPrompt,
            type: AlexaSkill.speechOutputType.PLAIN_TEXT
        };

    response.ask(speechOutput, repromptOutput);
}

function handleHelpRequest(response) {
    var repromptText = "Which city would you like event information for?";
    var speechOutput = "I can lead you through providing a city and "
        + "day of the week to get event information, "
        + "For a list of supported cities, ask what cities are supported. "
        + "Or you can say exit. "
        + repromptText;

    response.ask(speechOutput, repromptText);
}

/**
 * Handles the case where the user asked or for, or is otherwise being with supported cities
 */
function handleSupportedCitiesRequest(intent, session, response) {
    var repromptText = "Which city would you like event information for?";
    var speechOutput = "Currently, I know e information for these cities: " + getAllStationsText()
        + repromptText;

    response.ask(speechOutput, repromptText);
}

/**
 * Handles the dialog step where the user provides a city
 */
function handleCityDialogRequest(intent, session, response) {

    var cityStation = getCityStationFromIntent(intent, false),
        repromptText,
        speechOutput;
    if (cityStation.error) {
        repromptText = "Currently, I know event information for these coastal cities: " + getAllStationsText()
            + "Which city would you like event information for?";
        // if we received a value for the incorrect city, repeat it to the user, otherwise we received an empty slot
        speechOutput = cityStation.city ? "I'm sorry, I don't have any data for " + cityStation.city + ". " + repromptText : repromptText;
        response.ask(speechOutput, repromptText);
        return;


    }

    // if we don't have a date yet, go to date. If we have a date, we perform the final request
    if (session.attributes.date) {
        getFinalEventResponse(cityStation, session.attributes.date, response);
    } else {
        // set city in session and prompt for date
        session.attributes.city = cityStation;
        speechOutput = "For which date?";
        repromptText = "For which date would you like event information for " + cityStation.city + "?";

        response.ask(speechOutput, repromptText);
    }
}

/**
 * Handles the dialog step where the user provides a date
 */
function handleDateDialogRequest(intent, session, response) {

    var date = getDateFromIntent(intent),
        repromptText,
        speechOutput;
    if (!date) {
        repromptText = "Please try again saying a day of the week, for example, Saturday. "
            + "For which date would you like tide information?";
        speechOutput = "I'm sorry, I didn't understand that date. " + repromptText;

        response.ask(speechOutput, repromptText);
        return;
    }

    // if we don't have a city yet, go to city. If we have a city, we perform the final request
    if (session.attributes.city) {
        getFinalEventResponse(session.attributes.city, date, response);
    } else {
        // The user provided a date out of turn. Set date in session and prompt for city
        session.attributes.date = date;
        speechOutput = "For which city would you like tide information for " + date.displayDate + "?";
        repromptText = "For which city?";

        response.ask(speechOutput, repromptText);
    }
}

/**
 * Handle no slots, or slot(s) with no values.
 * In the case of a dialog based skill with multiple slots,
 * when passed a slot with no value, we cannot have confidence
 * it is the correct slot type so we rely on session state to
 * determine the next turn in the dialog, and reprompt.
 */
function handleNoSlotDialogRequest(intent, session, response) {
    if (session.attributes.city) {
        // get date re-prompt
        var repromptText = "Please try again saying a day of the week, for example, Saturday. ";
        var speechOutput = repromptText;

        response.ask(speechOutput, repromptText);
    } else {
        // get city re-prompt
        handleSupportedCitiesRequest(intent, session, response);
    }
}

/**
 * This handles the one-shot interaction, where the user utters a phrase like:
 * 'Alexa, open Tide Pooler and get tide information for Seattle on Saturday'.
 * If there is an error in a slot, this will guide the user to the dialog approach.
 */
function handleOneshotEventRequest(intent, session, response) {

    // Determine city, using default if none provided
    var cityStation = getCityStationFromIntent(intent, true),
        repromptText,
        speechOutput;
    if (cityStation.error) {
        // invalid city. move to the dialog
        repromptText = "Currently, I know tide information for these coastal cities: " + getAllStationsText()
            + "Which city would you like tide information for?";
        // if we received a value for the incorrect city, repeat it to the user, otherwise we received an empty slot
        speechOutput = cityStation.city ? "I'm sorry, I don't have any data for " + cityStation.city + ". " + repromptText : repromptText;

        response.ask(speechOutput, repromptText);
        return;
    }

    // Determine custom date
    var date = getDateFromIntent(intent);
    if (!date) {
        // Invalid date. set city in session and prompt for date
        session.attributes.city = cityStation;
        repromptText = "Please try again saying a day of the week, for example, Saturday. "
            + "For which date would you like tide information?";
        speechOutput = "I'm sorry, I didn't understand that date. " + repromptText;

        response.ask(speechOutput, repromptText);
        return;
    }

    // all slots filled, either from the user or by default values. Move to final request
    getFinalEventResponse(cityStation, date, response);
}

/**
 * Both the one-shot and dialog based paths lead to this method to issue the request, and
 * respond to the user with the final answer.
 */
function getFinalEventResponse(cityStation, date, response) {

    // Issue the request, and respond to the user
    makeEventRequest(cityStation.station, date, function tideResponseCallback(err, highTideResponse) {
        var speechOutput;

        if (err) {
            speechOutput = "Sorry, the National Oceanic tide service is experiencing a problem. Please try again later";
        } else {
            speechOutput = date.displayDate + " in " + cityStation.city + ", the first high tide will be around "
                + highTideResponse.firstHighTideTime + ", and will peak at about " + highTideResponse.firstHighTideHeight
                + ", followed by a low tide at around " + highTideResponse.lowTideTime
                + " that will be about " + highTideResponse.lowTideHeight
                + ". The second high tide will be around " + highTideResponse.secondHighTideTime
                + ", and will peak at about " + highTideResponse.secondHighTideHeight + ".";
        }

        response.tellWithCard(speechOutput,
            TicketingSystem, speechOutput)
    });
}

/**
 * Uses NOAA.gov API, documented: http://tidesandcurrents.noaa.gov/api/
 * Results can be verified at: http://tidesandcurrents.noaa.gov/noaatidepredictions/NOAATidesFacade.jsp?Stationid=[id]
 */
function makeEventRequest(station, date, eventResponseCallback) {

    var datum = "MLLW";
    var endpoint = 'http://tidesandcurrents.noaa.gov/api/datagetter';
    var queryString = '?' + date.requestDateParam;
    queryString += '&station=' + station;
    queryString += '&product=predictions&datum=' + datum + '&units=english&time_zone=lst_ldt&format=json';

    http.get(endpoint + queryString, function (res) {
        var noaaResponseString = '';
        console.log('Status Code: ' + res.statusCode);

        if (res.statusCode != 200) {
            tideResponseCallback(new Error("Non 200 Response"));
        }

        res.on('data', function (data) {
            noaaResponseString += data;
        });

        res.on('end', function () {
            var noaaResponseObject = JSON.parse(noaaResponseString);

            if (noaaResponseObject.error) {
                console.log("NOAA error: " + noaaResponseObj.error.message);
                tideResponseCallback(new Error(noaaResponseObj.error.message));
            } else {
                var highTide = findHighTide(noaaResponseObject);
                tideResponseCallback(null, highTide);
            }
        });
    }).on('error', function (e) {
        console.log("Communications error: " + e.message);
        tideResponseCallback(new Error(e.message));
    });
}

/**
 * Algorithm to find the 2 high tides for the day, the first of which is smaller and occurs
 * mid-day, the second of which is larger and typically in the evening
 */
function findHighTide(noaaResponseObj) {
    var predictions = noaaResponseObj.predictions;
    var lastPrediction;
    var firstHighTide, secondHighTide, lowTide;
    var firstTideDone = false;

    for (var i = 0; i < predictions.length; i++) {
        var prediction = predictions[i];

        if (!lastPrediction) {
            lastPrediction = prediction;
            continue;
        }

        if (isTideIncreasing(lastPrediction, prediction)) {
            if (!firstTideDone) {
                firstHighTide = prediction;
            } else {
                secondHighTide = prediction;
            }

        } else { // we're decreasing

            if (!firstTideDone && firstHighTide) {
                firstTideDone = true;
            } else if (secondHighTide) {
                break; // we're decreasing after have found 2nd tide. We're done.
            }

            if (firstTideDone) {
                lowTide = prediction;
            }
        }

        lastPrediction = prediction;
    }

    return {
        firstHighTideTime: alexaDateUtil.getFormattedTime(new Date(firstHighTide.t)),
        firstHighTideHeight: getFormattedHeight(firstHighTide.v),
        lowTideTime: alexaDateUtil.getFormattedTime(new Date(lowTide.t)),
        lowTideHeight: getFormattedHeight(lowTide.v),
        secondHighTideTime: alexaDateUtil.getFormattedTime(new Date(secondHighTide.t)),
        secondHighTideHeight: getFormattedHeight(secondHighTide.v)
    }
}

function isTideIncreasing(lastPrediction, currentPrediction) {
    return parseFloat(lastPrediction.v) < parseFloat(currentPrediction.v);
}

/**
 * Formats the height, rounding to the nearest 1/2 foot. e.g.
 * 4.354 -> "four and a half feet".
 */
function getFormattedHeight(height) {
    var isNegative = false;
    if (height < 0) {
        height = Math.abs(height);
        isNegative = true;
    }

    var remainder = height % 1;
    var feet, remainderText;

    if (remainder < 0.25) {
        remainderText = '';
        feet = Math.floor(height);
    } else if (remainder < 0.75) {
        remainderText = " and a half";
        feet = Math.floor(height);
    } else {
        remainderText = '';
        feet = Math.ceil(height);
    }

    if (isNegative) {
        feet *= -1;
    }

    var formattedHeight = feet + remainderText + " feet";
    return formattedHeight;
}

/**
 * Gets the city from the intent, or returns an error
 */
function getCityStationFromIntent(intent, assignDefault) {

    var citySlot = intent.slots.City;
    // slots can be missing, or slots can be provided but with empty value.
    // must test for both.
    if (!citySlot || !citySlot.value) {
        if (!assignDefault) {
            return {
                error: true
            }
        } else {
            // For sample skill, default to Seattle.
            return {
                city: 'seattle',
            
            }
        }
    } else {
        // lookup the city. Sample skill uses well known mapping of a few known cities to station id.
        var cityName = citySlot.value;
        if (CITIES[cityName.toLowerCase()]) {
            return {
                city: cityName,
                station: STATIONS[cityName.toLowerCase()]
            }
        } else {
            return {
                error: true,
                city: cityName
            }
        }
    }
}

/**
 * Gets the date from the intent, defaulting to today if none provided,
 * or returns an error
 */
function getDateFromIntent(intent) {

    var dateSlot = intent.slots.Date;
    // slots can be missing, or slots can be provided but with empty value.
    // must test for both.
    if (!dateSlot || !dateSlot.value) {
        // default to today
        return {
            displayDate: "Today",
            requestDateParam: "date=today"
        }
    } else {

        var date = new Date(dateSlot.value);

        // format the request date like YYYYMMDD
        var month = (date.getMonth() + 1);
        month = month < 10 ? '0' + month : month;
        var dayOfMonth = date.getDate();
        dayOfMonth = dayOfMonth < 10 ? '0' + dayOfMonth : dayOfMonth;
        var requestDay = "begin_date=" + date.getFullYear() + month + dayOfMonth
            + "&range=24";

        return {
            displayDate: alexaDateUtil.getFormattedDate(date),
            requestDateParam: requestDay
        }
    }
}

function getAllStationsText() {
    var stationList = '';
    for (var station in STATIONS) {
        stationList += station + ", ";
    }

    return stationList;
}

// Create the handler that responds to the Alexa Request.
exports.handler = function (event, context) {
    
    var ticketingSystem = new TicketingSystem();
  
  ticketingSystem.execute(event, context);
};
