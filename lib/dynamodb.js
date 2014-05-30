/**
 * Module dependencies
 */

var AWS = require('aws-sdk');
var colors = require('colors');
exports.initialize = function initializeSchema(schema, callback) {
  console.log("Initializing dynamodb adapter");

  // s stores the schema settings
  var s = schema.settings;


  if (schema.settings) {
    s.host = schema.settings.host || "localhost";
    s.port = schema.settings.port || 8000;
    s.region = schema.settings.region || "ap-southeast-1";
    s.accessKeyId = schema.settings.accessKeyId || "fake";
    s.secretAccessKey = schema.settings.secretAccessKey || "fake";
    s.ReadCapacityUnits = schema.settings.ReadCapacityUnits || 5;
    s.WriteCapacityUnits = schema.settings.WriteCapacityUnits || 10;
  }
  schema.adapter = new DynamoDB(s, schema, callback);
};

function DynamoDB(s, schema, callback) {
  if (!AWS) {
    throw new Error("AWS SDK not installed. Please run npm install aws-sdk");
    return;
  }
  var i, n;
  this.name = 'dynamodb';
  this._models = {};
  this._tables = {};
  this._ReadCapacityUnits = s.ReadCapacityUnits;
  this._WriteCapacityUnites = s.WriteCapacityUnits;
  // Connect to dynamodb server
  /*AWS.config.update({
    accessKeyId: s.accessKeyId,
    secretAccessKey: s.secretAccessKey,
    region: s.region
  });*/
	AWS.config.update({
    accessKeyId: "fake",
    secretAccessKey: "fake",
    region: "ap-southeast-1"
  });
		
	var dynamodb= new AWS.DynamoDB({ endpoint: new AWS.Endpoint('http://' + s.host+':'+s.port) });
  schema.adapter = dynamodb;
  this.adapter = dynamodb; // Used by instance methods
  callback();
}


function TypeLookup(typestring) {
  if (typestring === "string") {
    return 'S';
  } else if (typestring === "number") {
    return 'N';
  } else if (typestring === "binary") {
    return 'B';
  } else {
    return null;
  }
}

function ReverseTypeLookup(typestring) {
  if (typestring === 'S') {
    return "string";
  } else if (typestring === 'N') {
    return "number";
  } else if (typestring === 'B') {
    return "binary";
  } else {
    return "string";
  }
}

/*
	Assign Attribute Definitions
	and KeySchema based on the keys
*/
function AssignKeys(name, type, settings) {
  var attr = {};
  attr.keyType = name.keyType;
  var aType = typeof (name.type());
  attr.attributeType = TypeLookup(aType);
  return attr;
}

/**
 * Define schema and create table with hash and range keys
 * @param  {object} descr : description specified in the schema
 */
DynamoDB.prototype.define = function (descr) {
  if (!descr.settings) descr.settings = {};
  var modelName = descr.model.modelName;
  this._models[modelName] = descr;
  this._models[modelName].hashKey = {};
  this._models[modelName].rangeKey = [];
  // Create table now with the hash and range index.
  var properties = descr.properties;
  // Iterate through properties and find index
  var tableParams = {};
  tableParams.AttributeDefinitions = [];
  tableParams.KeySchema = [];
  this._models[modelName].breakables = [];
  this._models[modelName].breakValues = [];

  /*
    Build KeySchema for the table based on schema definitions.
   */
  for (var key in properties) {
    // Assign breakers, limits or whatever other properties
    // are specified first
    if (properties[key].breaker) {
       /*
        The key specifies that the attribute value must
        be broken down into N chunks where N is the value
        of breaker
       */
      this._models[modelName].breakables.push(key);
      this._models[modelName].breakValues.push(properties[key].breaker);
    }
    var attributes = AssignKeys(properties[key]);
    // The keys have come! Add to tableParams
    // Add Attribute Definitions

    // HASH primary key?
    if (attributes.keyType === "hash") {
      this._models[modelName].hashKey = key;
      tableParams.KeySchema.push({
        AttributeName: key,
        KeyType: 'HASH'
      });
      tableParams.AttributeDefinitions.push({
        AttributeName: key,
        AttributeType: attributes.attributeType
      });
    }
    // Range primary key?
    if (attributes.keyType === "range") {
      this._models[modelName].rangeKey.push(key);
      tableParams.KeySchema.push({
        AttributeName: key,
        KeyType: 'RANGE'
      });
      tableParams.AttributeDefinitions.push({
        AttributeName: key,
        AttributeType: attributes.attributeType
      });
    }
  }
  // Hard code throughput for now
  tableParams.ProvisionedThroughput = {
    ReadCapacityUnits: 5,
    WriteCapacityUnits: 10
  };

  // Assign table name
  tableParams.TableName = descr.model.modelName;
  var tableExists = false;
  this.adapter.listTables(function (err, data) {
    if (err) {
      console.log(err.toString());
      console.log("-------Error while fetching tables from server. Please check your connection settings & AWS config--------");
      return;
    }
    // Boolean variable to check if table already exists.
    var existingTableNames = data.TableNames;
    existingTableNames.forEach(function (existingTableName) {
      if (tableParams.TableName === existingTableName) {
        tableExists = true;
        console.log("----------Table %s found in database----------",existingTableName);
      }
    });
    // If table exists do not create new table
    if (tableExists === false) {
      // DynamoDB will throw error saying table does not exist
      console.log("----------Creating Table: %s in DynamoDB----------", tableParams.TableName);
      this.adapter.createTable(tableParams, function (err, data) {
        if (err) {
          console.log(err.toString());
        } // an error occurred
        else if (!data) {
          console.log("Could not create table");
        } else {
          console.log("Table created");
        }; // successful response
      });
    }
  }.bind(this));

};

/**
 * Helper function to convert a regular model
 * object to DynamoDB JSON notation.
 * 
 * e.g 20 will be returned as { 'N': '20' }
 * & `foobar` will be returned as { 'S' : 'foobar' } 
 *
 * Usage
 * - objToDB(20);
 * - objToDB("foobar");
 * ----------------------------------------------
 * 
 * @param  {object} data to be converted
 * @return {object} DynamoDB compatible JSON object
 */
function objToDB (data) {
	var tempObj = {};
  var elementType = TypeLookup(typeof (data));
  tempObj[elementType] = data.toString();
  return tempObj;
}

/**
 * Helper function to convert a DynamoDB type
 * object into regular model object.
 *
 * e.g { 'N': '20' } will be returned as 20
 * & { 'S' : 'foobar' }  will be returned as `foobar`
 * 
 * @param  {object} data 
 * @return {object}  
 */
function objFromDB (data) {
	var tempObj;
	for (var key in data) {
		if (data.hasOwnProperty(key)) {
			var elementType = ReverseTypeLookup(key);
			if (elementType === "string") {
				tempObj = data[key];
			} else if (elementType ==="number") {
				tempObj = Number(data[key]);
			}
		}
	}
	return tempObj;
}


/**
 * Creates a DynamoDB compatible representation
 * of arrays, objects and primitives.
 * @param {object} data: Object to be converted
 * @return {object} DynamoDB compatible JSON
 */
function DynamoFromJSON(data) {
	/*
		If data is an array, loop through each member
		of the array, and call objToDB on the element
		e.g ["someword",20] --> [ {'S': 'someword'} , {'N' : '20'}]
	 */
  if (data instanceof Array) {
    var obj = [];
    data.forEach(function (dataElement) {
      obj.push(objToDB(dataElement));
    });
  } 
		/*
		If data is an object, loop through each member
		of the object, and call objToDB on the element
		e.g { age: 20 } --> { age: {'N' : '20'} }
	 */
  else if (data instanceof Object) {
    var obj = {};
    for (var key in data) {
      if (data.hasOwnProperty(key)) {
        obj[key] = objToDB(data[key]);
      }
    }
    /*
		If data is a number, or string call objToDB on the element
		e.g 20 --> {'N' : '20'}
	 */
  } else {
    
    obj = objToDB(data);
  }
  return obj;
}

function JSONFromDynamo(data) {
	if (data instanceof Object) {
    var obj = {};
    for (var key in data) {
      if (data.hasOwnProperty(key)) {
        obj[key] = objFromDB(data[key]);
      }
    }
  }
  return obj;
}


/**
 * Converts jugglingdb operators like 'gt' to DynamoDB fomr 'GT'
 * @param {string} DynamoDB comparison operator
 */
function OperatorLookup(operator) {
  return operator.toUpperCase();
}

DynamoDB.prototype.defineProperty = function (model, prop, params) {
  this._models[model].properties[prop] = params;
};

DynamoDB.prototype.tables = function (name) {
  if (!this._tables[name]) {
    this._tables[name] = name;
  }
  return this._tables[name];
};

/**
 * Slice a string into N different strings
 * @param  {String} str : The string to be chunked
 * @param  {Number} N   : Number of pieces into which the string must be broken
 * @return {Array}  Array of N strings
 */
function splitSlice(str, N) {
  var ret =[];
  var strLen = str.length;
  var len = Math.floor(strLen / N) + 1;
  var residue = strLen % len;
  var offset = 0;
  for (var index = 1; index < N; index++) {
    var subString = str.slice(offset, len + offset);
    ret.push(subString); 
    offset = offset + len;
  }
  ret.push(str.slice(offset, residue + offset));
  return ret;
}

/**
 * Chunks data and assigns it to the data object
 * @param {Object} data : Complete data object
 * @param {String} key  : Attribute to be chunked
 * @param {Number} N    : Number of chunks
 */
function ChunkMe(data, key, N) {
  var counter;
  //Call splitSlice to chunk the data
  var chunkedData = splitSlice(data[key], N);
  //Assign each element in the chunked data
  //to data.
  for (counter = 1; counter <= N; counter++) {
    var chunkKeyName = key + String(counter);
    // DynamoDB does not allow empty strings.
    // So filter out empty strings
    if (chunkedData[counter-1] !== "") {
      data[chunkKeyName] = chunkedData[counter-1];
    }
  }
  // Finally delete data[key]
  delete data[key];
  return data;
}

/**
 * Create a new item or replace/update it if it exists
 * @param  {object}   model
 * @param  {object}   data   : key,value pairs of new model object
 * @param  {Function} callback
 */
DynamoDB.prototype.create = function (model, data, callback) {
  var queryString = "DYNAMODB >>> CREATE ITEM " +  String(model) + " IN TABLE " + this.tables(model);
	console.log(queryString.blue);
  var tableParams = {};
  tableParams.TableName = this.tables(model);
  /* Data is the original object coming in the body. In the body
     if the data has a key which is breakable, it must be chunked
     into N different attributes. N is specified by the breakValue[key]
  */
  var breakableAttributes = this._models[model].breakables;
  var breakableValues = this._models[model].breakValues;
  var outerCounter = 0;
  breakableAttributes.forEach(function (breakableAttribute){
    for (var key in data) {
    if (data.hasOwnProperty(key)) {
        if (key === breakableAttribute) {
            /*
              ChunkMe will take the data, key and the break count
              and return with new attributes appended serially from 
              1 to break count. If N is specified as 0, then N is
              automatically assigned based on the size of the string
             */
            var N;
            if (breakableValues[outerCounter] === -1) {
              var dataSize = Buffer.byteLength(data[key], 'utf8');
              N = Math.ceil(dataSize/64000);
            } else {
              N = breakableValues[outerCounter];
            }
            data = ChunkMe(data, key, N);
            console.log(data);
        }
      }
    }
    outerCounter ++;
  });
  
  tableParams.Item = DynamoFromJSON(data);
  this.adapter.putItem(tableParams, function (err, res) {
    if (err) {
    	console.log(err.toString());
      callback(err, null);
    } else { // Attributes is an object
      callback(null, data);
    }
  });
};



function query(model, filter, hashKey, queryString) {
  // Table parameters to do the query/scan
  var tableParams = {};

  // Define the filter if it does not exist
  if (!filter) {
    filter = {};
  }
  // Initialize query as an empty object
  var query = {};
  // Construct query for amazon DynamoDB
  tableParams.KeyConditions = {};
  // Set queryfileter to empty object
  tableParams.QueryFilter = {};
  // If a where clause exists in the query, extract
  // the conditions from it.
  if (filter.where) {
  	queryString = queryString + " WHERE ";
    for (key in filter.where) {
      var condition = filter.where[key];
      // If condition is of type object, obtain key
      // and the actual condition on the key

      // In jugglingdb, `where` can have the following
      // forms.
      // 1) where : { key: value }
      // 2) where : { startTime : { gt : Date.now() } }
      // 3) where : { someKey : ["something","nothing"] }

      // condition now holds value in case 1),
      //  { gt: Date.now() } in case 2)
      // ["something, "nothing"] in case 3)


      /*
				If key is of hash or hash & range type,
				we can use the query function of dynamodb
				to access the table. This saves a lot of time
				since it does not have to look at all records
			*/


      var insideKey = null;
      if (condition && condition.constructor.name === 'Object') {
        insideKey = Object.keys(condition)[0];
        condition = condition[insideKey];
        // insideKey now holds gt and condition now holds Date.now()
        query[key] = {
          operator: OperatorLookup(insideKey),
          attributes: condition
        };
      } else if (condition && condition.constructor.name === "Array") {
        query[key] = {
          operator: 'IN',
          attributes: condition
        };
      } else {
        query[key] = {
          operator: 'EQ',
          attributes: condition
        };
      }
      if (key === hashKey) {
        // Add hashkey eq condition to keyconditions
        tableParams.KeyConditions[key] = {};
        tableParams.KeyConditions[key].ComparisonOperator = query[key].operator;
        tableParams.KeyConditions[key].AttributeValueList = [];
        tableParams.KeyConditions[key].AttributeValueList.push(DynamoFromJSON(query[key].attributes));
        queryString = queryString + " HASHKEY: `" + String(key) + "` " + String(query[key].operator) + " `" + String(query[key].attributes) + "`";
      } else {
        tableParams.QueryFilter[key] = {};
        tableParams.QueryFilter[key].ComparisonOperator = query[key].operator;
        tableParams.QueryFilter[key].AttributeValueList = [];
        tableParams.QueryFilter[key].AttributeValueList.push(DynamoFromJSON(query[key].attributes));
        queryString = queryString + " `" + String(key) + "` " + String(query[key].operator) + " `" + String(query[key].attributes) + "`";
      }
      
    }
  }
  queryString = queryString + ' WITH QUERY OPERATION ';
  console.log(queryString.blue);
  return tableParams;
}


function scan(model, filter, queryString) {
  // Table parameters to do the query/scan
  var tableParams = {};

  // Define the filter if it does not exist
  if (!filter) {
    filter = {};
  }
  // Initialize query as an empty object
  var query = {};
  // Set scanfilter to empty object
  tableParams.ScanFilter = {};
  // If a where clause exists in the query, extract
  // the conditions from it.
  if (filter.where) {
  	queryString = queryString + " WHERE ";
    for (key in filter.where) {
      var condition = filter.where[key];
      // If condition is of type object, obtain key
      // and the actual condition on the key

      // In jugglingdb, `where` can have the following
      // forms.
      // 1) where : { key: value }
      // 2) where : { startTime : { gt : Date.now() } }
      // 3) where : { someKey : ["something","nothing"] }

      // condition now holds value in case 1),
      //  { gt: Date.now() } in case 2)
      // ["something, "nothing"] in case 3)

      var insideKey = null;
      if (condition && condition.constructor.name === 'Object') {
        insideKey = Object.keys(condition)[0];
        condition = condition[insideKey];
        // insideKey now holds gt and condition now holds Date.now()
        query[key] = {
          operator: OperatorLookup(insideKey),
          attributes: condition
        };
      } else if (condition && condition.constructor.name === "Array") {
        query[key] = {
          operator: 'IN',
          attributes: condition
        };
     } else {
        query[key] = {
          operator: 'EQ',
          attributes: condition
        };
      }

      tableParams.ScanFilter[key] = {};
      tableParams.ScanFilter[key].ComparisonOperator = query[key].operator;
      tableParams.ScanFilter[key].AttributeValueList = [];
      tableParams.ScanFilter[key].AttributeValueList.push(DynamoFromJSON(query[key].attributes));
      queryString = queryString + " `" + String(key) + "` " + String(query[key].operator) + " `" + String(query[key].attributes) + "`";
    }
    }
  queryString = queryString + ' WITH SCAN OPERATION ';
  console.log(queryString.blue);
  return tableParams;
}


/**
 *  Uses Amazon DynamoDB query/scan function to fetch all
 *  matching entries in the table.
 *
 */
DynamoDB.prototype.all = function all(model, filter, callback) {
	var queryString = "DYNAMODB >>> GET ALL ITEMS FROM TABLE ";
	queryString = queryString + String(this.tables(model));
  // If hashKey is present in where filter, use query
  var hashKeyFound = false;
  if (filter && filter.where) {
    for (var key in filter.where) {
      if (key === this._models[model].hashKey) {
        hashKeyFound = true;
      }
    }
  }
  // If true use query function
  if (hashKeyFound === true) {
    var tableParams = query(model, filter, this._models[model].hashKey, queryString);
    // Set table name based on model
    tableParams.TableName = this.tables(model);
    // If KeyConditions exist, then call DynamoDB query function
    if (tableParams.KeyConditions) {

      this.adapter.query(tableParams, function (err, res) {
        if (err) {
        	console.log(err.toString().red);
          callback(err, null);
        } else if (!res) {
          callback(null, null);
        } else {
        	// Returns an array of objects. Pass each one to
        	// JSONFromDynamo and push to empty array
        	var finalResult = [];
        	res.Items.forEach(function (item){
        		finalResult.push(JSONFromDynamo(item));
        	});
          callback(null, finalResult);
        }
      });
    }
  } else {
    // Call scan function
    var tableParams = scan(model, filter, queryString);
    tableParams.TableName = this.tables(model);
    // Scan DynamoDB table
    this.adapter.scan(tableParams, function (err, res) {
      if (err) {
      	console.log(err.toString().red);
        callback(err, null);
      } else if (!res) {
        callback(null, null);
      } else {
        // Returns an array of objects. Pass each one to
        	// JSONFromDynamo and push to empty array
        	var finalResult = [];
        	res.Items.forEach(function (item){
        		finalResult.push(JSONFromDynamo(item));
        	});
          callback(null, finalResult);
      }
    });
  }
};

/**
 * [find description]
 * @param  {[type]}   model    [description]
 * @param  {[type]}   hashKey  [description]
 * @param  {Function} callback [description]
 * @return {[type]}            [description]
 */
DynamoDB.prototype.find = function find(model, hashKey, callback) {
	var queryString = "DYNAMODB >>> GET AN ITEM FROM TABLE ";
	queryString = queryString + String(this.tables(model));
  var filter = {};
  filter.where = {};

  hashKey = parseInt(hashKey);
  filter.where[this._models[model].hashKey] = hashKey;

  var tableParams = query(model, filter, this._models[model].hashKey, queryString);
  tableParams.TableName = this.tables(model);

  if (tableParams.KeyConditions) {
    this.adapter.query(tableParams, function (err, res) {
      if (err) {
        callback(err, null);
      } else if (!res) {
        callback(null, null);
      } else {

        callback(null, JSONFromDynamo(res.Items[0]));
      }
    });
  }
};

DynamoDB.prototype.save = function save(model, data, callback) {
  var tableParams = {};
  tableParams.TableName = this.tables(model);
  tableParams.Item = DynamoFromJSON(data);
  this.adapter.putItem(tableParams, function (err, res) {
    if (err) {
      callback(err, null);
    } else {
      callback(null, data);
    }
  });
};

DynamoDB.prototype.updateAttributes = function (model, hashKey, data, callback) {
	var queryString = "DYNAMODB >>> UPDATE ITEM IN TABLE ";
	queryString = queryString + String(this.tables(model));
  // Use updateItem function of DynamoDB
  var tableParams = {};
  // Set table name as usual
  tableParams.TableName = this.tables(model);
  tableParams.Key = {};
  tableParams.AttributeUpdates = {};
  // Add hashKey to tableParams
  tableParams.Key[this._models[model].hashKey] = DynamoFromJSON(hashKey);
  // Add attributes to update
  for (key in data) {
    if (data.hasOwnProperty(key) && data[key] !== null && (key !== this._models[model].hashKey)) {
      tableParams.AttributeUpdates[key] = {};
      tableParams.AttributeUpdates[key].Action = 'PUT';
      tableParams.AttributeUpdates[key].Value = DynamoFromJSON(data[key]);
    }
  }
  tableParams.ReturnValues = "ALL_NEW";
  this.adapter.updateItem(tableParams, function (err, res) {
    if (err) {
      console.log(err.toString());
      callback(err, null);
    } else if (!res) {
      callback(null, null);
    } else {
      // Attributes is an object
      var temp = [];
      for (var key in res.Attributes) {
        temp.push(res.Attributes[key]);
      }
      callback(null, JSONFromDynamo(temp));
    }
  });
};

DynamoDB.prototype.destroy = function(model, hashKey, callback) {
	// Use updateItem function of DynamoDB
  var tableParams = {};
  // Set table name as usual
  tableParams.TableName = this.tables(model);
  tableParams.Key = {};
  // Add hashKey to tableParams
  tableParams.Key[this._models[model].hashKey] = DynamoFromJSON(hashKey);
  tableParams.ReturnValues = "ALL_OLD";
   this.adapter.deleteItem(tableParams, function (err, res) {
    if (err) {
      console.log(err.toString());
      callback(err, null);
    } else if (!res) {
      callback(null, null);
    } else {
      // Attributes is an object
      var temp = [];
      for (var key in res.Attributes) {
        temp.push(res.Attributes[key]);
      }
      callback(null, objFromDB(temp));
    }
  });
};