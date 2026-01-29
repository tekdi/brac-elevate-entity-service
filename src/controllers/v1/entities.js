/**
 * name : entities.js
 * author : Priyanka Pradeep
 * created-date : 21-Mar-2024
 * Description : Entity Type related information.
 */

// Dependencies
const entitiesHelper = require(MODULES_BASE_PATH + '/entities/helper')
const csv = require('csvtojson')
const FileStream = require(PROJECT_ROOT_DIRECTORY + '/generics/file-stream')
const entitiesQueries = require(DB_QUERY_BASE_PATH + '/entities')

/**
 * entities
 * @class
 */

module.exports = class Entities extends Abstract {
	/**
	 * @apiDefine errorBody
	 * @apiError {String} status 4XX,5XX
	 * @apiError {String} message Error
	 */

	/**
	 * @apiDefine successBody
	 *  @apiSuccess {String} status 200
	 * @apiSuccess {String} result Data
	 */

	constructor() {
		super('entities')
	}

	static get name() {
		return 'entities'
	}

	/**
	 * Find all the entities based on the projection.
	 * @api {POST} /v1/entities/find all the API based on projection
	 * @apiVersion 1.0.0
	 * @apiName find
	 * @param {Object} req - The request object.
	 * @param {Object} req.body.query - MongoDB filter query to match specific entity documents.
	 * @param {Object} req.body.projection - Fields to include or exclude in the result set.
	 * @param {Number} req.pageNo - Page number for pagination.
	 * @param {Number} req.pageSize - Number of documents to return per page.
	 * @param {String} req.searchText - Optional search string for text-based filtering.
	 * @param {String|null} req.query.aggregateValue - Field path to be used for aggregation (e.g., "groups.school"); set to `null` if not used.
	 * @param {Boolean} req.query.aggregateStaging - Whether to apply aggregation stages in the pipeline.
	 * @param {Boolean} req.query.aggregateSort - Whether to apply sorting within the aggregation pipeline.
	 * @param {Array<Object>} req.body.aggregateProjection - Optional array of projection stages for aggregation.
	 * 
	 * @returns {Promise<Object>} - A Promise resolving to a list of matched entity documents with pagination.
	 * @apiGroup Entities
	 * @apiSampleRequest {
		"query" : {
			"metaInformation.externalId" : "PBS"
		},

		"projection": [
			"_id"
		]
		}
	 * @apiUse successBody
	 * @apiUse errorBody
	 * @apiParamExample {json} Response:
	 * @returns {JSON} - List of all entities.
	 *  "result": [
		{
			"_id": "6613b8142c7d9408449474bf"
		},
		{
			"_id": "6613b8f32c7d9408449474c2"
		}
	]
	 */

	find(req) {
		console.log('Reached in find controller')
		return new Promise(async (resolve, reject) => {
			try {
				// Calls the 'find' function from 'entitiesHelper' to retrieve entity data
				req.body.query = UTILS.stripOrgIds(req.body.query)
				let entityData = await entitiesHelper.find(
					req.body.query,
					req.body.projection,
					req.pageNo,
					req.pageSize,
					req.searchText,
					req.query.aggregateValue ? req.query.aggregateValue : null,
					req.query.aggregateStaging == 'true' ? true : false,
					req.query.aggregateSort == 'true' ? true : false,
					req.body.aggregateProjection ? req.body.aggregateProjection : []
				)
				return resolve(entityData)
			} catch (error) {
				return reject({
					status: error.status || HTTP_STATUS_CODE.internal_server_error.status,
					message: error.message || HTTP_STATUS_CODE.internal_server_error.message,
					errorObject: error,
				})
			}
		})
	}

	/**
      * @api {get} v1/entities/relatedEntities/:entityId Get Related Entities
      * @apiVersion 1.0.0
      * @apiName Get Related Entities
      * @apiGroup Entities
	  * @param {Object} req - The request object.
      * @apiSampleRequest v1/entities/relatedEntities/5c0bbab881bdbe330655da7f
      * @apiUse successBody
      * @apiUse errorBody
      * @apiParamExample {json} Response:
	 "result": {
		"relatedEntities": [
			{
				"_id": "5f33c3d85f637784791cd830",
				"entityTypeId": "5f32d8228e0dc8312404056e",
				"entityType": "state",
				"metaInformation": {
					"externalId": "MH",
					"name": "Maharashtra"
				}
			},
			{
				"_id": "5fbf3f8c3e9df47967eed916",
				"entityTypeId": "5f32d8228e0dc8312404056e",
				"entityType": "state",
				"metaInformation": {
					"externalId": "993067ca-8499-4ef5-9325-560d3b3e5de9",
					"name": "Himachal Pradesh"
				}
			}
		]
	**/
	relatedEntities(req) {
		return new Promise(async (resolve, reject) => {
			try {
				let result = {}
				let projection = [
					'metaInformation.externalId',
					'metaInformation.name',
					'metaInformation.addressLine1',
					'metaInformation.addressLine2',
					'metaInformation.administration',
					'metaInformation.city',
					'metaInformation.country',
					'entityTypeId',
					'entityType',
				]
				let tenantId = req.userDetails.userInformation.tenantId
				let entityDocument = await entitiesQueries.entityDocuments(
					{ _id: req.params._id, tenantId: tenantId },
					projection
				)

				if (entityDocument.length < 1) {
					throw {
						status: HTTP_STATUS_CODE.not_found.status,
						message: CONSTANTS.apiResponses.ENTITY_NOT_FOUND,
					}
				}

				let relatedEntities = await entitiesHelper.relatedEntities(
					entityDocument[0]._id,
					entityDocument[0].entityTypeId,
					entityDocument[0].entityType,
					projection,
					tenantId
				)
				_.merge(result, entityDocument[0])
				result['relatedEntities'] = relatedEntities.length > 0 ? relatedEntities : []

				return resolve({
					message: CONSTANTS.apiResponses.ENTITY_FETCHED,
					result: result,
				})
			} catch (error) {
				return reject({
					status: error.status || HTTP_STATUS_CODE.internal_server_error.status,
					message: error.message || HTTP_STATUS_CODE.internal_server_error.message,
					errorObject: error,
				})
			}
		})
	}

	/**
	 * Find all the entities based on the projection.
	 * @api {GET} /v1/entities/entityListBasedOnEntityType?entityType=state all the API based on projection
	 * @apiVersion 1.0.0
	 * @apiName entityListBasedOnEntityType
	 * @apiGroup Entities
	 * @param {Object} req - The request object.
	 * @apiUse successBody
	 * @apiUse errorBody
	 * @apiParamExample {json} Response:
	 * @returns {JSON} - List of all entities.
	 *  {
    "message": "ASSETS_FETCHED_SUCCESSFULLY",
    "status": 200,
    "result": [
        {
            "_id": "665d8df5c6892808846230e7",
            "name": "goa"
        },
        {
            "_id": "665d96cdc6892808846230f1",
            "name": "Arunachal Pradesh"
        }
    ]
	}
	 */

	entityListBasedOnEntityType(req) {
		return new Promise(async (resolve, reject) => {
			try {
				// Call helper function to fetch entity data based on entity type
				let entityData = await entitiesHelper.entityListBasedOnEntityType(
					req.query.entityType,
					req.pageNo,
					req.pageSize,
					req?.query?.paginate?.toLowerCase() == 'true' ? true : false,
					req.query.language ? req.query.language : '',
					req.userDetails
				)
				return resolve(entityData)
			} catch (error) {
				return reject({
					// Handle any errors that occur during the fetch operation
					status: error.status || HTTP_STATUS_CODE.internal_server_error.status,
					message: error.message || HTTP_STATUS_CODE.internal_server_error.message,
					errorObject: error,
				})
			}
		})
	}

	/**
	  * @api {post} v1/entities/createMappingCsv
	  * @apiVersion 1.0.0
	  * @apiName createMappingCsv
	  * @apiGroup Entities
	  * @apiParam {File} entityCSV Mandatory entity mapping file of type CSV.
	  * @param {Object} req - The request object.
	  * @apiUse successBody
	  * @apiUse errorBody
	  * @param {Object} req - The request object containing the uploaded CSV file in `req.files.entityCSV`.
	  * @returns {Promise<Object>} Resolves with a success message and the mapped entities or rejects with an error object.
	  * @returns {JSON} - Message of successfully created.
	  * 
	  * {
		"message": "MAPPING_CSV_GENERATED",
		"status": 200,
		"result": {
        "mappingCSV": "cGFyZW50RW50aXR5SWQsY2hpbGRFbnRpdHlJZAo2NzY1NWEwMmM0YzNhYjIxOThmNzUyYjEsNjc2NTU5ZjRjNGMzYWIyMTk4Zjc1MjY4CjY3NjU1OWY0YzRjM2FiMjE5OGY3NTI2OCw2NzY1NTllMmM0YzNhYjIxOThmNzUwYzkKNjc2NTU5ZTJjNGMzYWIyMTk4Zjc1MGM5LDY3NjU1OWNiYzRjM2FiMjE5OGY3MzMyNgo2NzY1NTljYmM0YzNhYjIxOThmNzMzMjYsNjc2NTQ5YTljNGMzYWIyMTk4ZjRjNTZkCjY3NjU1YTAyYzRjM2FiMjE5OGY3NTJiMSw2NzY1NTlmNGM0YzNhYjIxOThmNzUyNjgKNjc2NTU5ZjRjNGMzYWIyMTk4Zjc1MjY4LDY3NjU1OWUyYzRjM2FiMjE5OGY3NTBjOQo2NzY1NTllMmM0YzNhYjIxOThmNzUwYzksNjc2NTU5Y2JjNGMzYWIyMTk4ZjczMzI2CjY3NjU1OWNiYzRjM2FiMjE5OGY3MzMyNiw2NzY1NDlhOWM0YzNhYjIxOThmNGM1NmUKNjc2NTVhMDJjNGMzYWIyMTk4Zjc1MmIxLDY3NjU1OWY0YzRjM2FiMjE5OGY3NTI2OAo2NzY1NTlmNGM0YzNhYjIxOThmNzUyNjgsNjc2NTU5ZTJjNGMzYWIyMTk4Zjc1MGM5CjY3NjU1OWUyYzRjM2FiMjE5OGY3NTBjOSw2NzY1NTljYmM0YzNhYjIxOThmNzMzMjcKNjc2NTU5Y2JjNGMzYWIyMTk4ZjczMzI3LDY3NjU0OWE5YzRjM2FiMjE5OGY0YzU2Zgo=",
        "resultCSV": "InN0YXRlIiwiZGlzdHJpY3QiLCJibG9jayIsImNsdXN0ZXIiLCJzY2hvb2wiLCJzdGF0ZVN0YXR1cyIsImRpc3RyaWN0U3RhdHVzIiwiYmxvY2tTdGF0dXMiLCJjbHVzdGVyU3RhdHVzIiwic2Nob29sU3RhdHVzIgoiS0FSIiwiS0FSRGlzdDEiLCJLQVJibG9jazEiLCJLQVJjbHVzdGVyMSIsIktBUnNjaG9vbDEiLCJFTlRJVFlfRkVUQ0hFRCIsIkVOVElUWV9GRVRDSEVEIiwiRU5USVRZX0ZFVENIRUQiLCJFTlRJVFlfRkVUQ0hFRCIsIkVOVElUWV9GRVRDSEVEIgoiS0FSIiwiS0FSRGlzdDEiLCJLQVJibG9jazEiLCJLQVJjbHVzdGVyMSIsIktBUnNjaG9vbDIiLCJFTlRJVFlfRkVUQ0hFRCIsIkVOVElUWV9GRVRDSEVEIiwiRU5USVRZX0ZFVENIRUQiLCJFTlRJVFlfRkVUQ0hFRCIsIkVOVElUWV9GRVRDSEVEIgoiS0FSIiwiS0FSRGlzdDEiLCJLQVJibG9jazEiLCJLQVJjbHVzdGVyMiIsIktBUnNjaG9vbDMiLCJFTlRJVFlfRkVUQ0hFRCIsIkVOVElUWV9GRVRDSEVEIiwiRU5USVRZX0ZFVENIRUQiLCJFTlRJVFlfRkVUQ0hFRCIsIkVOVElUWV9GRVRDSEVEIg==",
        "parentEntityIds": [
            "67655a02c4c3ab2198f752b1",
            "676559f4c4c3ab2198f75268",
            "676559e2c4c3ab2198f750c9",
            "676559cbc4c3ab2198f73326",
            "67655a02c4c3ab2198f752b1",
            "676559f4c4c3ab2198f75268",
            "676559e2c4c3ab2198f750c9",
            "676559cbc4c3ab2198f73326",
            "67655a02c4c3ab2198f752b1",
            "676559f4c4c3ab2198f75268",
            "676559e2c4c3ab2198f750c9",
            "676559cbc4c3ab2198f73327"
        ],
        "childEntityIds": [
            "676559f4c4c3ab2198f75268",
            "676559e2c4c3ab2198f750c9",
            "676559cbc4c3ab2198f73326",
            "676549a9c4c3ab2198f4c56d",
            "676559f4c4c3ab2198f75268",
            "676559e2c4c3ab2198f750c9",
            "676559cbc4c3ab2198f73326",
            "676549a9c4c3ab2198f4c56e",
            "676559f4c4c3ab2198f75268",
            "676559e2c4c3ab2198f750c9",
            "676559cbc4c3ab2198f73327",
            "676549a9c4c3ab2198f4c56f"
        ]
    	}
	}
	*/

	createMappingCsv(req) {
		return new Promise(async (resolve, reject) => {
			try {
				let tenantId = req.userDetails.tenantAndOrgInfo.tenantId
				// Parse CSV data from the uploaded file in the request body
				let entityCSVData = await csv().fromString(req.files.entityCSV.data.toString())

				// Process the entity mapping upload data using 'entitiesHelper.createMappingCsv'
				let mappedEntities = await entitiesHelper.createMappingCsv(entityCSVData, tenantId)

				return resolve({
					message: CONSTANTS.apiResponses.MAPPING_CSV_GENERATED,
					result: mappedEntities,
				})
			} catch (error) {
				return reject({
					status: error.status || HTTP_STATUS_CODE.internal_server_error.status,
					message: error.message || HTTP_STATUS_CODE.internal_server_error.message,
					errorObject: error,
				})
			}
		})
	}

	/**
	  * @api {post} v1/entities/mappingUpload
	  * @apiVersion 1.0.0
	  * @apiName mappingUpload
	  * @apiGroup Entities
	  * @apiParam {File} entityMap Mandatory entity mapping file of type CSV.
	  * @param {Object} req - The request object.
	  * @apiUse successBody
	  * @apiUse errorBody
      * @param {Array} req.files.entityMap - Array of entityMap data.         
     * @returns {JSON} - Message of successfully updated.
     * 
     * {
		"message": "ENTITY_INFORMATION_UPDATE",
		"status": 200,
		"result": {
			"success": true,
			"message": "ENTITY_INFORMATION_UPDATE"
		}
	 }
    */

	mappingUpload(req) {
		return new Promise(async (resolve, reject) => {
			try {
				// Parse CSV data from the uploaded file in the request body
				let entityCSVData = await csv().fromString(req.files.entityMap.data.toString())

				// Process the entity mapping upload data using 'entitiesHelper.processEntityMappingUploadData'
				let entityMappingUploadResponse = await entitiesHelper.processEntityMappingUploadData(entityCSVData)

				// Check if the entity mapping upload was successful
				if (!entityMappingUploadResponse.success) {
					throw new Error(CONSTANTS.apiResponses.SOMETHING_WENT_WRONG)
				}

				return resolve({
					message: CONSTANTS.apiResponses.ENTITY_INFORMATION_UPDATE,
					result: entityMappingUploadResponse,
				})
			} catch (error) {
				return reject({
					status: error.status || HTTP_STATUS_CODE.internal_server_error.status,
					message: error.message || HTTP_STATUS_CODE.internal_server_error.message,
					errorObject: error,
				})
			}
		})
	}

	/**
	 * Handles the request to fetch targeted roles based on the provided entity IDs in the request parameters.
	  * @api {GET} v1/entities/targetedRoles/5f33c3d85f637784791cd831?roleLevel=professional_subroles&entityType=state&language=en&paginate=true all the API based on projection
	  * @apiVersion 1.0.0
	  * @apiName targetedRoles
	  * @apiGroup Entities
	  * @apiUse successBody
	  * @apiUse errorBody
	 * @param {Object} req - The request object containing parameters and user details.
	 * @returns {Promise<Object>} A promise that resolves to the response containing the fetched roles or an error object.
	 * * @returns {JSON} - Message of successfully response.
     * 
     * {
    "message": "ROLES_FETCHED_SUCCESSFULLY",
    "status": 200,
    "result": [
         {
            "_id": "682301254e2812081f34266c",
            "value": "teacher-class-11-12",
            "label": "Teacher (Class 11-12)",
            "code": "teacher-class-11-12"
        },
        {
            "_id": "682301424e2812081f342670",
            "value": "special-educators",
            "label": "Special Educators",
            "code": "special-educators"
        }
    ],
    "count": 2
    }
    */
	targetedRoles(req) {
		return new Promise(async (resolve, reject) => {
			try {
				// Calls the 'targetedRoles' function from 'entitiesHelper' to retrieve entity data
				let userRoleDetails = await entitiesHelper.targetedRoles(
					req.params._id,
					req.pageNo,
					req.pageSize,
					req?.query?.paginate?.toLowerCase() == 'true' ? true : false,
					req.query.entityType ? req.query.entityType : '',
					req.query.language ? req.query.language : '',
					req.query.roleLevel ? req.query.roleLevel : '',
					req.userDetails.userInformation.tenantId
				)
				// Resolves the promise with the retrieved entity data
				return resolve(userRoleDetails)
			} catch (error) {
				return reject({
					status: error.status || HTTP_STATUS_CODE.internal_server_error.status,
					message: error.message || HTTP_STATUS_CODE.internal_server_error.message,
					errorObject: error,
				})
			}
		})
	}

	/**
	 * details of the entities.
	 * @api {get} v1/entities/details provide the details 
	 * @apiVersion 1.0.0
	 * @apiName details
	 * @apiGroup Entities
	 * @apiHeader {String} X-authenticated-user-token Authenticity token
	 * @param {Object} req - The request object.
	 * @apiSampleRequest v1/entities/details/67dcf90f97174bab15241faa?&language=hi
	 * @apiUse successBody
	 * @apiUse errorBody
	 * @returns {JSON} - provide the details.
	 * 
	 {
    "message": "ENTITY_INFORMATION_FETCHED",
    "status": 200,
    "result": [
        {
            "_id": "667bf60c3d7cec1dab341ee9",
            "childHierarchyPath": [],
            "allowedRoles": [],
            "createdBy": "SYSTEM",
            "updatedBy": "SYSTEM",
            "deleted": false,
            "entityTypeId": "6638c5bfb87e1acce3fcd6af",
            "entityType": "school",
            "registryDetails": {
                "locationId": "KA28",
                "code": "KA28"
            },
            "metaInformation": {
                "externalId": "KA28",
                "name": "Govt School Bijapur"
            },
            "updatedAt": "2024-06-26T11:05:48.397Z",
            "createdAt": "2024-06-26T11:05:48.397Z",
            "__v": 0,
            "groups": {},
            "orgId": "1",
            "tenantId": "1",
            "parentInformation": {
                "state": [
                    {
                        "_id": "665d8df5c6892808846230e7",
                        "externalId": "KA",
                        "name": "Karnataka"
                    }
                ],
                "block": [
                    {
                        "_id": "66790a8cba9a0b5bd7d6aba0",
                        "externalId": "KA2825",
                        "name": "Bijapur"
                    }
                ]
            }
        }
    ]
	}
	*/

	details(req) {
		return new Promise(async (resolve, reject) => {
			try {
				// Prepare parameters for 'entitiesHelper.details' based on request data
				let result = await entitiesHelper.details(
					req.params._id ? req.params._id : '',
					req.body ? req.body : {},
					req.query.language ? req.query.language : '',
					req.userDetails
				)

				return resolve(result)
			} catch (error) {
				return reject({
					status: error.status || HTTP_STATUS_CODE.internal_server_error.status,
					message: error.message || HTTP_STATUS_CODE.internal_server_error.message,
					errorObject: error,
				})
			}
		})
	}

	/**
	 * Update entity information.
	 * @api {POST} /v1/entities/update single entities
	 * @apiVersion 1.0.0
	 * @apiName update
	 * @apiGroup Entities
	 * @apiHeader {String} X-authenticated-user-token Authenticity token
	 * @apiSampleRequest /v1/entities/update/663364443c990eaa179e289e
	 * @apiUse successBody
	 * @apiUse errorBody
	 * @param {Object} req - requested entity data.
	 * @returns {JSON} - Updated entity information.
	 * 
	 *  
	{
    "message": "ENTITY_UPDATED",
    "status": 200,
    "result": {
        "metaInformation": {
            "targetedEntityTypes": [
                "state ",
                "block"
            ],
            "externalId": "KA280",
            "name": "Karnataka"
        },
        "registryDetails": {
            "locationId": "KA280",
            "code": "KA280"
        },
        "childHierarchyPath": [],
        "createdBy": "456",
        "updatedBy": "456",
        "deleted": false,
        "_id": "68f84c5be09cc92d37d26cce",
        "entityTypeId": "68f849082be5592a62b67ad3",
        "entityType": "subroles",
        "userId": "456",
        "tenantId": "shikshalokam",
        "orgId": "slorg",
        "updatedAt": "2025-10-22T04:06:35.790Z",
        "createdAt": "2025-10-22T03:15:39.145Z",
        "__v": 0
    }
	}
	*/

	update(req) {
		return new Promise(async (resolve, reject) => {
			try {
				// Call 'entitiesHelper.update' to perform the entity update operation
				let result = await entitiesHelper.update(req.params._id, req.body, req.userDetails)

				return resolve(result)
			} catch (error) {
				return reject({
					status: error.status || HTTP_STATUS_CODE.bad_request.status,
					message: error.message || HTTP_STATUS_CODE.bad_request.message,
					errorObject: error,
				})
			}
		})
	}

	/**
	 * Add entities.
	 * @api {POST} /entity/api/v1/entities/create single entities
	 * @apiVersion 1.0.0
	 * @apiName add
	 * @apiGroup Entities
	 * @apiHeader {String} X-authenticated-user-token Authenticity token
	 * @apiSampleRequest /entity/api/v1/entities/add
	 * @apiUse successBody
	 * @apiUse errorBody
	 * @param {Object} req - All requested Data.
	 * @returns {JSON} - Added entities information.
	 * 
	 *   {
    "message": "ENTITY_ADDED",
    "status": 200,
    "result": [
        {
            "metaInformation": {
                "targetedEntityTypes": [],
                "externalId": "KA280",
                "name": "Karnataka"
            },
            "childHierarchyPath": [],
            "createdBy": "456",
            "updatedBy": "456",
            "_id": "68f84c5be09cc92d37d26cce",
            "deleted": false,
            "entityTypeId": "68f849082be5592a62b67ad3",
            "entityType": "subroles",
            "registryDetails": {
                "locationId": "KA280",
                "code": "KA280"
            },
            "userId": "456",
            "tenantId": "shikshalokam",
            "orgId": "slorg",
            "updatedAt": "2025-10-22T03:15:39.145Z",
            "createdAt": "2025-10-22T03:15:39.145Z",
            "__v": 0
        }
    ]
	}
	*/

	add(req) {
		return new Promise(async (resolve, reject) => {
			try {
				// Prepare query parameters for adding the entity
				let queryParams = {
					type: req.query.type,
					parentEntityId: req.query.parentEntityId,
				}
				// Call 'entitiesHelper.add' to perform the entity addition operation
				let result = await entitiesHelper.add(queryParams, req.body, req.userDetails)

				return resolve({
					message: CONSTANTS.apiResponses.ENTITY_ADDED,
					result: result,
				})
			} catch (error) {
				return reject({
					status: error.status || HTTP_STATUS_CODE.internal_server_error.status,
					message: error.message || HTTP_STATUS_CODE.internal_server_error.message,
					errorObject: error,
				})
			}
		})
	}

	/**
	 * Add entities after bulk import from user service.
	 * @api {POST} /entity/api/v1/entities/createUserAsAnEntity
	 * @apiVersion 1.0.0
	 * @apiName createUserAsAnEntity
	 * @apiGroup Entities
	 * @apiHeader {String} X-authenticated-user-token Authenticity token
	 * @apiHeader {String} internal-access-token Internal access token
	 * @param {Object} req - Event data from user service bulk create.
	 * @returns {JSON} - Added entity information.
	 */
	createUserAsAnEntity(req) {
		return new Promise(async (resolve, reject) => {
			try {
				const eventData = req.body

				// Get organizations from event data - check direct, oldValues, and newValues
				const organizations =
					eventData.organizations ||
					eventData.oldValues?.organizations ||
					eventData.newValues?.organizations ||
					[]

				// Determine entity type based on roles in organizations array
				// Priority: first check for org_admin role, then check for user role
				let entityType = null
				if (organizations.length > 0 && organizations[0].roles && Array.isArray(organizations[0].roles)) {
					const roles = organizations[0].roles
					const roleTitles = roles.map((role) => role.title || role.label)

					// Check for org_admin role first (higher priority)
					if (roleTitles.includes(CONSTANTS.common.ORG_ADMIN)) {
						entityType = 'linkageChampion'
					} else if (roleTitles.includes(CONSTANTS.common.USER_ROLE)) {
						// Check for user role
						entityType = 'participant'
					}
				}

				// If no supported role found, skip the operation
				if (!entityType) {
					return resolve({
						message: CONSTANTS.apiResponses.ENTITY_TYPE_NOT_SUPPORTED,
						result: null,
					})
				}

				// Extract required data from event - check direct, oldValues, and newValues
				const externalId = eventData.entityId ? eventData.entityId.toString() : null
				const name = eventData.name || eventData.oldValues?.name || eventData.newValues?.name || null

				if (!externalId || !name) {
					return reject({
						status: HTTP_STATUS_CODE.bad_request.status,
						message: CONSTANTS.apiResponses.MISSING_REQUIRED_FIELDS,
						errorObject: { externalId, name },
					})
				}

				// Construct userDetails from event data - check direct, oldValues, and newValues
				const tenantId =
					eventData.tenant_code ||
					eventData.oldValues?.tenant_code ||
					eventData.newValues?.tenant_code ||
					null
				const orgId = organizations.length > 0 ? organizations[0].id : null
				const userId =
					eventData.created_by ||
					eventData.id ||
					eventData.userId ||
					eventData.oldValues?.id ||
					eventData.newValues?.id ||
					null

				if (!tenantId || !orgId) {
					return reject({
						status: HTTP_STATUS_CODE.bad_request.status,
						message: CONSTANTS.apiResponses.MISSING_TENANT_OR_ORG_INFO,
						errorObject: { tenantId, orgId },
					})
				}

				const userDetails = {
					userInformation: {
						userId: userId ? userId.toString() : 'SYSTEM',
					},
					tenantAndOrgInfo: {
						tenantId: tenantId,
						orgId: [orgId.toString()],
					},
				}

				// Check if entity with same externalId already exists
				const existingEntity = await entitiesQueries.findOne(
					{
						'metaInformation.externalId': externalId,
						entityType: entityType,
						tenantId: tenantId,
					},
					{ _id: 1, metaInformation: 1, entityType: 1 }
				)

				if (existingEntity) {
					// Entity already exists, return existing entity
					return resolve({
						message: CONSTANTS.apiResponses.ENTITY_ALREADY_EXISTS,
						result: existingEntity,
					})
				}

				// Prepare query parameters
				const queryParams = {
					type: entityType,
				}

				// Prepare request body for entity creation
				const entityBody = {
					externalId: externalId,
					name: name,
				}

				// Call 'entitiesHelper.add' to perform the entity addition operation
				let result = await entitiesHelper.add(queryParams, entityBody, userDetails)

				return resolve({
					message: CONSTANTS.apiResponses.ENTITY_ADDED,
					result: result,
				})
			} catch (error) {
				return reject({
					status: error.status || HTTP_STATUS_CODE.internal_server_error.status,
					message: error.message || HTTP_STATUS_CODE.internal_server_error.message,
					errorObject: error,
				})
			}
		})
	}

	/**
	 * List of entities by location ids.
	 * @api {get} v1/entities/list List all entities based locationIds
	 * @apiVersion 1.0.0
	 * @apiName listByLocationIds
	 * @apiGroup Entities
	 * @apiHeader {String} X-authenticated-user-token Authenticity token
	 * @apiSampleRequest v1/entities/listByLocationIds
	 * @apiUse successBody
	 * @apiUse errorBody
	 * @param {Object} req - requested data.
	 * @returns {Object} -
	 * 
	 *   "result": [
		{
			"_id": "5f33c3d85f637784791cd830",
			"entityTypeId": "5f32d8228e0dc8312404056e",
			"entityType": "state",
			"metaInformation": {
				"externalId": "MH",
				"name": "Maharashtra",
				"region": "West",
				"capital": "Mumbai"
			},
			"registryDetails": {
				"locationId": "db331a8c-b9e2-45f8-b3c0-7ec1e826b6df",
				"code": "db331a8c-b9e2-45f8-b3c0-7ec1e826b6df"
			}
		}
     ]
	*/

	listByLocationIds(req) {
		return new Promise(async (resolve, reject) => {
			try {
				// Call 'entitiesHelper.listByLocationIds' to retrieve entities based on location IDs
				let entitiesData = await entitiesHelper.listByLocationIds(req.body.locationIds, req.userDetails)

				entitiesData.result = entitiesData.data

				return resolve(entitiesData)
			} catch (error) {
				return reject({
					status: error.status || HTTP_STATUS_CODE.internal_server_error.status,
					message: error.message || HTTP_STATUS_CODE.internal_server_error.message,
					errorObject: error,
				})
			}
		})
	}

	/**
	 * Entities child hierarchy path
	 * @api {get} v1/entities/subEntityListBasedOnRoleAndLocation List all entities based on Location and Role
	 * @apiVersion 1.0.0
	 * @apiName subEntityListBasedOnRoleAndLocation
	 * @apiGroup Entities
	 * @apiHeader {String} X-authenticated-user-token Authenticity token
	 * @apiSampleRequest v1/entities/subEntityListBasedOnRoleAndLocation
	 * @param {Object} req - The request object.
	 * @apiUse successBody
	 * @apiUse errorBody
	 * @param {String} req.params._id - entityId.
	 * @returns {JSON} - Entities child hierarchy path
	 * 
	 * 
	"result": [
		{
			"_id": "5f33c3d85f637784791cd830",
			"childHierarchyPath": [
				"district",
				"cluster",
				"school"
			]
		},
		{
			"_id": "627a13928ce12806f5803f57",
			"childHierarchyPath": [
				"district",
				"cluster",
				"school"
			]
		} 
	 ]

	*/

	subEntityListBasedOnRoleAndLocation(req) {
		return new Promise(async (resolve, reject) => {
			try {
				// Call 'entitiesHelper.subEntityListBasedOnRoleAndLocation' to retrieve sub-entity list
				const entityTypeMappingData = await entitiesHelper.subEntityListBasedOnRoleAndLocation(
					req.params._id,
					req.userDetails
				)
				return resolve(entityTypeMappingData)
			} catch (error) {
				return reject({
					status: error.status || HTTP_STATUS_CODE['internal_server_error'].status,
					message: error.message || HTTP_STATUS_CODE['internal_server_error'].message,
				})
			}
		})
	}

	/**
	* @api {get} v1/entities/listByEntityType all entities based on EntityType
	* @apiVersion 1.0.0
	* @apiName listByEntityType
	* @apiGroup Entities
	* @apiHeader {String} X-authenticated-user-token Authenticity token
	* @apiSampleRequest v1/entities/listByEntityType
	* @apiUse successBody
	* @apiUse errorBody
	* @param {Object} req - requested data.
	* @returns {JSON} - Array of entities.

	"result": [
			{
				"externalId": "PBS",
				"name": "Punjab",
				"locationId": "",
				"_id": "6613b8142c7d9408449474bf"
			},
			{
				"externalId": "PBS",
				"name": "Punjab",
				"locationId": "",
				"_id": "6613b8f32c7d9408449474c2"
			},
		]
    */

	listByEntityType(req, res) {
		return new Promise(async (resolve, reject) => {
			try {
				// Call 'entitiesHelper.listEntitiesByType' to retrieve entities based on the request
				const result = await entitiesHelper.listEntitiesByType(req)

				return resolve(result)
			} catch (error) {
				return reject({
					status: error.status || HTTP_STATUS_CODE.internal_server_error.status,
					message: error.message || HTTP_STATUS_CODE.internal_server_error.message,
					errorObject: error,
				})
			}
		})
	}

	/**
	* @api {get} v1/entities/list List all entities
	* @apiVersion 1.0.0
	* @apiName Entities list
	* @apiGroup Entities
	* @apiHeader {String} X-authenticated-user-token Authenticity token
	* @apiSampleRequest /v1/entities/list
	* @apiUse successBody
	* @apiUse errorBody
	* @param {Object} req - The request object.
	* @apiParamExample {json} Response:
	* "result": [
	{
		"_id": "5ce23d633c330302e720e661",
		"name": "teacher"
	},
	{
		"_id": "5ce23d633c330302e720e663",
		"name": "schoolLeader"
	}
	]
    */

	list(req) {
		return new Promise(async (resolve, reject) => {
			try {
				// Call 'entitiesHelper.list' to retrieve entities based on provided parameters
				let result = await entitiesHelper.list(
					req.query.type,
					req.params._id,
					req.pageSize,
					req.pageSize * (req.pageNo - 1),
					req.schoolTypes,
					req.administrationTypes,
					req.userDetails
				)

				return resolve(result)
			} catch (error) {
				return reject({
					status: error.status || HTTP_STATUS_CODE.internal_server_error.status,
					message: error.message || HTTP_STATUS_CODE.internal_server_error.message,
					errorObject: error,
				})
			}
		})
	}

	/**
	* @api {GET} v1/entities/subEntityList/663339bc0cb19f01c459853b?type=school&search=&page=1&limit=100&parentInfoRequired=true&sortOrder=asc&sortKey=name
     * Get sub entity list for the given entity. 
     * @apiVersion 1.0.0
     * @apiGroup Entities
     * @apiHeader {String} X-authenticated-user-token Authenticity token
     * @apiSampleRequest v1/entities/subEntityList/663339bc0cb19f01c459853b?type=school&search=&page=1&limit=100&parentInfoRequired=true
     * @apiUse successBody
     * @apiUse errorBody
     * @apiParamExample {json} Response:
     * {
    "status": 200,
    "result": {
        "data": [
            {
                "_id": "627a13928ce12806f5803f57",
                "entityType": "school",
                "externalId": "entity123",
                "label": "undefined - entity123",
                "value": "627a13928ce12806f5803f57",
				"cluster": "CHOLACHAGUDDA",
				"district": "BAGALKOT",
            }
        ],
        "count": 1
    }
    }

    /**
	* Get the immediate entities .
	* @method
	* @name subEntityList
	* @param  {Request} req request body.
	* @param {String} req.params._id - entityId
 	  * @param {String} req.query.type - Entity Type
 	  * @param {String} req.query.language - language Code
 	  * @param {String} [req.query.sortOrder] - Sort order for results. Allowed values: 'asc'|'desc' (case-insensitive). If provided, 'sortKey' must also be provided.
 	  * @param {String} [req.query.sortKey] - Sort key for results. Allowed values: 'name'|'externalId'. If provided, 'sortOrder' must also be provided.
	* @returns {JSON} Returns list of immediate entities
     */

	subEntityList(req) {
		return new Promise(async (resolve, reject) => {
			// Check if required parameters (_id or entities) are missing
			if (!(req.params._id || req.body.entities)) {
				return resolve({
					status: HTTP_STATUS_CODE.bad_request.status,
					message: constants.apiResponses.ENTITY_ID_OR_LOCATION_ID_NOT_FOUND,
				})
			}

			try {
				// Call 'entitiesHelper.subEntityList' to retrieve sub-entities based on the request parameters
				let entityDocuments = await entitiesHelper.subEntityList(
					req.body.entities ? req.body.entities : '',
					req.params._id ? req.params._id : '',
					req.query.type ? req.query.type : '',
					req.searchText,
					req.pageSize,
					req.pageNo,
					req.query.language ? req.query.language : '',
					req.userDetails,
					req.query.parentInfoRequired ? req.query.parentInfoRequired : false,
					req?.query?.sortOrder,
					req?.query?.sortKey
				)
				return resolve(entityDocuments)
			} catch (error) {
				return reject({
					status: error.status || HTTP_STATUS_CODE.internal_server_error.status,
					message: error.message || HTTP_STATUS_CODE.internal_server_error.message,
					errorObject: error,
				})
			}
		})
	}

	/**
     * @api {GET} /v1/entities/listByIds
     * Get sub entity list for the given entity. 
     * @apiVersion 1.0.0
     * @apiGroup Entities
     * @apiHeader {String} X-authenticated-user-token Authenticity token
     * @apiSampleRequest{
		"entities": [
			"5f33c3d85f637784791cd830"
		],
		"fields": [
			"entityType"
		]
	}
     * @apiUse successBody
     * @apiUse errorBody
     * @apiParamExample {json} Response:

    /**
     * List of entities.
     * @method
     * @name listByIds
	 * @param {Object} req - requested data.       
	 * @returns {JSON} - Array of entities.
	*/

	listByIds(req) {
		return new Promise(async (resolve, reject) => {
			try {
				// Call 'entitiesHelper.listByEntityIds' to retrieve entities based on provided entity IDs and fields
				const entities = await entitiesHelper.listByEntityIds(
					req.body.entities,
					req.body.fields,
					req.userDetails
				)
				return resolve(entities)
			} catch (error) {
				return reject({
					status: error.status || HTTP_STATUS_CODE.internal_server_error.status,
					message: error.message || HTTP_STATUS_CODE.internal_server_error.message,
					errorObject: error,
				})
			}
		})
	}

	/**
	 * Bulk create entities.
	 * @api {POST}v1/entities/relatedEntities/Create API by uploading CSV
	 * @apiVersion 1.0.0
	 * @apiName bulkCreate
	 * @apiGroup Entities
	 * @apiSampleRequest /v1/entities/bulkCreate
	 * @apiUse successBody
	 * @apiUse errorBody
	 * @apiParamExample {json} Response:
	 * @param {Object} req - requested data.
	 * @returns {CSV} - A CSV with name Entity-Upload is saved inside the folder
	 * public/reports/currentDate
	 *
	 */

	bulkCreate(req) {
		return new Promise(async (resolve, reject) => {
			try {
				// Parse CSV data from uploaded file
				let entityCSVData = await csv().fromString(req.files.entities.data.toString())

				let translationFile = null

				// Parse translation file if provided
				if (req.files.translationFile) {
					translationFile = JSON.parse(req.files.translationFile.data.toString())
				}
				let newEntityData = await entitiesHelper.bulkCreate(
					req.query.type,
					null,
					null,
					req.userDetails,
					entityCSVData,
					translationFile
				)

				// Check if new entities were created successfully
				if (newEntityData.length > 0) {
					const fileName = `Entity-Upload`
					let fileStream = new FileStream(fileName)
					let input = fileStream.initStream()

					// Use Promise to handle stream processing and resolve with file details
					;(async function () {
						await fileStream.getProcessorPromise()
						return resolve({
							isResponseAStream: true,
							fileNameWithPath: fileStream.fileNameWithPath(),
						})
					})()

					// Push each new entity into the file stream for processing
					await Promise.all(
						newEntityData.map(async (newEntity) => {
							input.push(newEntity)
						})
					)

					input.push(null)
				} else {
					throw CONSTANTS.apiResponses.SOMETHING_WENT_WRONG
				}
			} catch (error) {
				return reject({
					status: error.status || HTTP_STATUS_CODE.internal_server_error.status,
					message: error.message || HTTP_STATUS_CODE.internal_server_error.message,
					errorObject: error,
				})
			}
		})
	}

	/**
	 * Bulk update entities.
	 * @api {POST} v1/entities/relatedEntities/Update API by uploading CSV
	 * @apiVersion 1.0.0
	 * @apiName bulkUpdate
	 * @apiGroup Entities
	 * @apiSampleRequest v1/entities/bulkUpdate
	 * @apiUse successBody
	 * @apiUse errorBody
	 * @apiParamExample {json} Response:
	 * @param {Object} req - requested data.
	 * @returns {CSV} - A CSV with name Entity-Upload is saved inside the folder
	 * public/reports/currentDate
	 *
	 */

	bulkUpdate(req) {
		return new Promise(async (resolve, reject) => {
			try {
				// Parse CSV data from uploaded file
				let entityCSVData = await csv().fromString(req.files.entities.data.toString())

				// Check if CSV data is valid and contains entities
				if (!entityCSVData || entityCSVData.length < 1) {
					throw CONSTANTS.apiResponses.ENTITY_TYPE_NOT_UPDATED
				}
				let translationFile = null

				// Parse translation file if provided
				if (req.files.translationFile) {
					translationFile = JSON.parse(req.files.translationFile.data.toString())
				}
				// Call 'entitiesHelper.bulkUpdate' to update entities based on CSV data and user details
				let newEntityData = await entitiesHelper.bulkUpdate(entityCSVData, translationFile, req.userDetails)

				// Check if entities were updated successfully
				if (newEntityData.length > 0) {
					const fileName = `Entity-Upload`
					let fileStream = new FileStream(fileName)
					let input = fileStream.initStream()

					// Use Promise to handle stream processing and resolve with file details
					;(async function () {
						await fileStream.getProcessorPromise()
						return resolve({
							isResponseAStream: true,
							fileNameWithPath: fileStream.fileNameWithPath(),
						})
					})()

					await Promise.all(
						newEntityData.map(async (newEntity) => {
							input.push(newEntity)
						})
					)

					input.push(null)
				} else {
					throw new Error(CONSTANTS.apiResponses.SOMETHING_WENT_WRONG)
				}
			} catch (error) {
				return reject({
					status: error.status || HTTP_STATUS_CODE.internal_server_error.status,
					message: error.message || HTTP_STATUS_CODE.internal_server_error.message,
					errorObject: error,
				})
			}
		})
	}
}
