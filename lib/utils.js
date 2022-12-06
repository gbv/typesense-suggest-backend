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
