const fs = require('fs');
const path = require('path');
const fetch = require('cross-fetch');
const util = require('util');
const FormData = require('form-data');
const express = require("express");
const cors = require('cors');
const dotenv = require('dotenv');
const app = express();
const { createBullBoard } = require('@bull-board/api');
const Worker = require('bull');
const Queue = require('bull');
const { BullAdapter } = require("@bull-board/api/bullAdapter");
const { ExpressAdapter } = require("@bull-board/express");
const os = require('os');

const { PdfCounter } = require("page-count");

dotenv.config();


// Create a new Date object
const currentDate = new Date();
// Get the day, month, and year
const day = padWithZero(currentDate.getDate());
const month = padWithZero(currentDate.getMonth() + 1); // Months are zero-indexed, so we add 1
const year = currentDate.getFullYear();
// Format the date as "d-m-y"
const formattedDate = `${year}${month}${day}`;

const qore_url = process.env.QORE_URL
const qore_secret = process.env.QORE_SECRET

const category = process.env.CATEGORY.toLowerCase().split(',');


const homeDirectory = os.homedir().replace(/\\/g, '/');
const directoryPath = `${homeDirectory}/Documents/Pegadaian Uploader/${formattedDate}/`; // Replace with your actual directory path
const table = process.env.TABLE
const column = process.env.COLUMN

const user_id = process.env.USERID
const nama_admin = process.env.ADMIN

app.use(cors());

function padWithZero(number) {
  return number < 10 ? `0${number}` : `${number}`;
}

// Create a Bull queue instance
const queueUpload = new Queue('uploadQueue', {
  redis: {
    // Provide your Redis connection options here
    host: 'localhost',
    port: 6379,
  },
});

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath("/bull-board");

// Create a Bull Board adapter
const queuesList = ["uploadQueue"];
const queues = queuesList
  .map((qs) => new Queue(qs, {
    host: 'localhost',
    port: 6379,
  }))
  .map((q) => new BullAdapter(q));

// Create a Bull Board instance
const { addQueue, removeQueue, setQueues, replaceQueues } = createBullBoard({
  queues,
  serverAdapter: serverAdapter,
});

// Start the Bull Board UI on a separate route
app.use('/bull-board', serverAdapter.getRouter());


app.get("/", async (req, res) => {
  //index
  return res.status(200).json({ message: 'Server running..' })
})

app.get("/getUser", async (req, res) => {
  const getUser = await execute([{
    "operation": "Select",
    "instruction": {
      table: 'users',
      name: 'users',
      "condition": {
        "$and": [
          {
            "id": {
              "$eq": user_id
            },
          }
        ],
      }
    }
  }]);

  if (getUser.results.users[0]) {
    return res.status(200).json({
      "user_id": user_id,
      "path": directoryPath,
      "nama_admin": getUser.results.users[0].nama
    })
  }
})

app.get("/cek-folder", async (req, res) => {
  const result = await getListFileUpload(false);

  if (result.statusCode == 200) {
    res.status(200).json(result)
  } else {
    res.status(400).json(result)
  }
});

app.post("/proses-upload", async (req, res) => {
  const result = await getListFileUpload(true);
  if (result.statusCode == 200) {
    res.status(200).json(result)
  } else {
    res.status(400).json(result)
  }
})

app.get('/tes', async (req, res) => {
  const data = req.body;
  // if (!data) {
  //   return res.status(400).json({ error: 'Data is required for the job.', req: req.body });
  // }
  // Add the job to the queue
  await queueUpload.add({ nama : "testing-upload"} );

  return res.json({ message: 'Job added to the queue.' });
});

const execute = async (body) => {
  const res = await fetch(
    `${qore_url}/v1/execute`,
    {
      method: 'POST',
      headers: new fetch.fetch.Headers([
        ['accept', '*/*'],
        ['x-qore-engine-admin-secret', qore_secret],
        ['Content-Type', 'application/json'],
      ]),
      body: JSON.stringify({
        operations: body,
      }),
    },
  );
  const response = await res.json();
  if (response.statusCode >= 400) {
    throw response.message;
  }
  return response;
};

const fileTokenTable = async (
  table,
  column,
  row,
  access
) => {
  const res = await fetch(
    `${qore_url}/v1/files/token/table/${table}/id/${row}/column/${column}?access=${access}`,
    {
      method: 'GET',
      headers: new fetch.Headers([
        ['x-qore-engine-admin-secret', qore_secret],
      ]),
    },
  );
  const response = await res.json();
  if (response.statusCode >= 400) {
    throw response.message;
  }
  return response.token;
};

// Function to get a list of folders and files inside a directory

const listFilesInFolder = async (folderPath) => {
  try {
    let fileArray = []
    const files = fs.readdirSync(folderPath);
    files.forEach((file, index) => {
      const itemPath = path.join(folderPath, file);
      const stats = fs.statSync(itemPath);

      if (stats.isFile()) {
        fileArray.push(file);
      }
    });


    return fileArray;
  } catch (error) {
    console.error('Error reading folder:', error.message);
    return [];
  }
}

const getListFileUpload = async (
  sendQue = false
) => {

  try {
    // Check if the directory exists
    fs.statSync(directoryPath, fs.constants.F_OK);

    const cekItem = []
    const errorList = []
    let totalFile = 0;
    let totalPage = 0;

    //folder pertama nama
    const foldernama = fs.readdirSync(directoryPath);
    for (const itemNama of foldernama) {
      const fullPathNama = path.join(directoryPath, itemNama);
      const statsNama = fs.statSync(fullPathNama);
      if (statsNama.isDirectory()) {
        const splitNama = itemNama.split("_");
        cekItem.push(`Folder : ${itemNama}`);

        //folder kedua ketegori
        const folderKategori = fs.readdirSync(fullPathNama);
        for (const itemKategori of folderKategori) {
          const fullPathKategori = path.join(fullPathNama, itemKategori);
          const statsKategori = fs.statSync(fullPathKategori);
          if (statsKategori.isDirectory()) {
            if (category.includes(itemKategori.toLowerCase())) {
              cekItem.push(`   Folder : ${itemKategori}`);

              const list_files = await listFilesInFolder(fullPathKategori);
              if (list_files.length > 0) {
                for (const file of list_files) {
                  if (!file.includes("(success)")) {
                    const fullPathImage = path.join(fullPathKategori, file);

                    const page = await countPages(fullPathImage);

                    cekItem.push(`      - ${file} (${page} Pages)`);

                    totalFile += 1

                    if (sendQue == true) {
                      await queueUpload.add({
                        "nomor": splitNama[0],
                        "nama": splitNama[1],
                        "kategori": itemKategori,
                        "file_name": file,
                        "fullPathImage": fullPathImage,
                        "page": page
                      });
                    }
                  }
                };
              }
            } else {
              errorList.push(`Invalid Category '${itemKategori}' in ${fullPathKategori}`);
            }

          }
        };
      }

    };

    return {
      folder: directoryPath,
      list: cekItem,
      total_file: totalFile,
      error: errorList,
      statusCode: 200
    }


  } catch (error) {
    // If an error occurs, the directory does not exist
    if (error.code === 'ENOENT') {
      return {
        message: `Folder does not exist at path: ${directoryPath}`,
        type: "Error",
        statusCode: 400
      }
    }
    // Handle other errors if needed
    throw error;
  }
}

const countPages = async (
  pathFile
) => {
  try {

    const pdfBuffer = fs.readFileSync(pathFile);

    if (isPDF(pdfBuffer)) {

      const pagesPdf = await PdfCounter.count(pdfBuffer);
      return pagesPdf
    } else {
      return 1
    }


  } catch (error) {
    throw new Error(`Error counting pages: ${error.message}`);
  }
}


function isPDF(buffer) {
  // Check if the file starts with the PDF signature ("%PDF")
  return buffer.toString('utf-8', 0, 4) === '%PDF';
}

function readImageIntoBuffer(filePath) {
  try {
    const buffer = fs.readFileSync(filePath);
    return buffer;
  } catch (error) {
    console.error('Error reading image:', error.message);
    return null;
  }
}

const renameFileWithPrefix = async (
  oldFilePath
) => {
  try {
    const directory = path.dirname(oldFilePath);
    const fileName = path.basename(oldFilePath, path.extname(oldFilePath));
    const fileExtension = path.extname(oldFilePath);
    const newFileName = `${fileName} (success)${fileExtension}`;
    const newFilePath = path.join(directory, newFileName);

    fs.renameSync(oldFilePath, newFilePath);

    return newFilePath;
  } catch (error) {
    throw error;
  }
}

// Start the Bull worker process
queueUpload.process(async (job) => {
  const data = job.data
  console.log('Processing job with data:', data);

  try {

    if(data.nama == "testing-upload"){
      return {
        "sukses" : "testing"
      }
    }

    //insert data
    const insert = await execute([{
      "operation": "Insert",
      "instruction": {
        "table": table,
        "name": table,
        "data": {
          "nama": data.nama.toUpperCase(),
          "nip": data.nomor,
          "kategori": data.kategori.toLowerCase(),
          "file_name": data.file_name,
          "created_by": user_id,
          "created_name": nama_admin,
          "page": data.page
        }
      }
    }]);

    // token table
    const tokenTable = await fileTokenTable(table, column, insert.results.file[0].id, "write");

    // upload data
    const buffer = readImageIntoBuffer(data.fullPathImage);
    const formData = new FormData();
    formData.append('file', buffer, { filename: data.file_name });
    const submitPromise = util.promisify(formData.submit).bind(formData);
    const submitOptions = {
      host: `${qore_url}`.replace('https://', ''),
      path: `/v1/files/upload?token=${tokenTable}`,
      headers: {
        'x-qore-engine-admin-secret': qore_secret,
      },
    };
    const res = await submitPromise(submitOptions);

    //rename file
    if (res) {
      await renameFileWithPrefix(data.fullPathImage);
    }

    // Perform the necessary task here
    console.log(`Job completed with data: ${data.fullPathImage}`);
    return { success: data };
  } catch (error) {
    // Handle the error
    return { error: error.message };
  }
});


exports.main = app;