import axios from "axios"
import fs from "fs"
import * as stream from "stream"
import { promisify } from "util"

export const waitForStream = promisify(stream.finished)

// https://stackoverflow.com/a/61269447
export async function downloadFile(url, file) {
  const writer = fs.createWriteStream(file)
  const response = await axios({
    method: "get",
    url,
    responseType: "stream",
  })
  response.data.pipe(writer)
  return waitForStream(writer)
}

/**
 * These are wrappers for Express middleware which receive a middleware function as a first parameter,
 * but wrap the call to the function with other functionality.
 *
 * Copied from jskos-server.
 */
export const wrappers = {

  /**
   * Wraps an async middleware function that returns data in the Promise.
   * The result of the Promise will be written into req.data for access by following middlewaren.
   * A rejected Promise will be caught and relayed to the Express error handling.
   *
   * adjusted from: https://thecodebarbarian.com/80-20-guide-to-express-error-handling
   */
  async(fn) {
    return (req, res, next) => {
      fn(req, res, next).then(data => {
        // On success, save the result of the Promise in req.data.
        req.data = data
        next()
      }).catch(error => {
        // Pass error to the next error middleware.
        next(error)
      })
    }
  },

}

/**
 * Middleware that returns JSON given in req.data.
 */
export const returnJSON = (req, res) => {
  // Convert Mongoose documents into plain objects
  let data
  if (Array.isArray(req.data)) {
    data = req.data.map(doc => doc.toObject ? doc.toObject() : doc)
    // Preserve totalCount
    data.totalCount = req.data.totalCount
  } else {
    data = req.data.toObject ? req.data.toObject() : req.data
  }
  // cleanJSON(data)
  let statusCode = 200
  if (req.method == "POST") {
    statusCode = 201
  }
  res.status(statusCode).json(data)
}
