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
dotenv.config();


// Create a new Date object
const currentDate = new Date();
// Get the day, month, and year
const day = currentDate.getDate();
const month = currentDate.getMonth() + 1; // Months are zero-indexed, so we add 1
const year = currentDate.getFullYear();
// Format the date as "d-m-y"
const formattedDate = `${year}${month}${day}`;

const qore_url = process.env.QORE_URL
const qore_secret = process.env.QORE_SECRET

const directoryPath = `/../Pegadaian Uploader/${formattedDate}/`; // Replace with your actual directory path
const table = process.env.TABLE
const column = process.env.COLUMN

const user_id = process.env.USERID
const nama_admin = process.env.ADMIN

app.use(cors());


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


app.get("/", (req, res) => {
  return res.status(200).json({ message: 'Server running..' })
})

app.get("/getUser", (req, res) => {
  return res.status(200).json({
    "user_id" : user_id,
    "path" : directoryPath,
    "nama_admin" : nama_admin
  })
})

app.get("/cek-folder", async (req, res) => {

  fs.access(directoryPath, fs.constants.F_OK, (err) => {
    if (err) {
      return res.status(400).json({
        message: `Folder does not exist at path: ${directoryPath}`,
        type: "Error"
      })
    } else {

      const cekItem = []
      let totalFile = 0;
      //folder pertama nama
      const foldernama = fs.readdirSync(directoryPath);
      foldernama.forEach(async itemNama => {
        const fullPathNama = path.join(directoryPath, itemNama);
        const statsNama = fs.statSync(fullPathNama);
        if (statsNama.isDirectory()) {
          const splitNama = itemNama.split("-");
          cekItem.push(`Folder : '${itemNama}`);
          //folder kedua ketegori
          const folderKategori = fs.readdirSync(fullPathNama);
          folderKategori.forEach(async itemKategori => {
            const fullPathKategori = path.join(fullPathNama, itemKategori);
            const statsKategori = fs.statSync(fullPathKategori);
            if (statsKategori.isDirectory()) {
              cekItem.push(`   Folder : '${itemKategori}`);
              const list_files = listFilesInFolder(fullPathKategori);
              if (list_files.length > 0) {
                list_files.forEach(async file => {
                  const fullPathImage = path.join(fullPathKategori, file);

                  cekItem.push(`      - ${file}`);
                  totalFile += 1;

                  // await queueUpload.add({ 
                  //   "nomor" : splitNama[0],
                  //   "nama" : splitNama[1],
                  //   "kategori" : itemKategori,
                  //   "file_name" : file,
                  //   "fullPathImage" : fullPathImage
                  //  });

                });
              }
            }
          });
        }

      });

      return res.status(200).json({
        folder: directoryPath,
        total_file : totalFile,
        list: cekItem
      })

    }
  })
});

app.post("/proses-upload", async (req, res) => {

  fs.access(directoryPath, fs.constants.F_OK, (err) => {
    if (err) {
      return res.status(400).json({
        message: `Folder does not exist at path: ${directoryPath}`,
        type: "Error"
      })
    } else {

      const cekItem = []
      //folder pertama nama
      const foldernama = fs.readdirSync(directoryPath);
      foldernama.forEach(async itemNama => {
        const fullPathNama = path.join(directoryPath, itemNama);
        const statsNama = fs.statSync(fullPathNama);
        if (statsNama.isDirectory()) {
          const splitNama = itemNama.split("-");
          cekItem.push(`Folder : '${itemNama}`);
          //folder kedua ketegori
          const folderKategori = fs.readdirSync(fullPathNama);
          folderKategori.forEach(async itemKategori => {
            const fullPathKategori = path.join(fullPathNama, itemKategori);
            const statsKategori = fs.statSync(fullPathKategori);
            if (statsKategori.isDirectory()) {
              cekItem.push(`   Folder : '${itemKategori}`);
              const list_files = listFilesInFolder(fullPathKategori);
              if (list_files.length > 0) {
                list_files.forEach(async file => {
                  const fullPathImage = path.join(fullPathKategori, file);

                  cekItem.push(`      - ${file}`);

                  await queueUpload.add({ 
                    "nomor" : splitNama[0],
                    "nama" : splitNama[1],
                    "kategori" : itemKategori,
                    "file_name" : file,
                    "fullPathImage" : fullPathImage
                   });

                });
              }
            }
          });
        }

      });

      return res.status(200).json({
        folder: directoryPath,
        list: cekItem
      })

    }
  })
})

app.post('/add-job', async (req, res) => {
  const data = req.body;
  if (!data) {
    return res.status(400).json({ error: 'Data is required for the job.', req: req.body });
  }
  // Add the job to the queue
  await queueUpload.add({ data });

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
function listFilesInFolder(folderPath) {
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

function readImageIntoBuffer(filePath) {
  try {
    const buffer = fs.readFileSync(filePath);
    return buffer;
  } catch (error) {
    console.error('Error reading image:', error.message);
    return null;
  }
}


const getFoldersAndFiles = async (directoryPath) => {
  try {
    const items = fs.readdirSync(directoryPath);

    const folders = [];
    const files = [];

    items.forEach(async item => {
      const fullPath = path.join(directoryPath, item);
      const stats = fs.statSync(fullPath);

      if (stats.isDirectory()) {
        folders.push(item);
        const list_files = listFilesInFolder(fullPath);
        if (list_files.length > 0) {
          console.log('Files in the folder:', item);

          list_files.forEach(async file => {
            const fullPathImage = path.join(fullPath, file);
            const buffer = readImageIntoBuffer(fullPathImage);
            console.log("-", fullPathImage);

            // insert data
            // const insert = await execute([{
            //   "operation": "Insert",
            //   "instruction": {
            //     "table": "sample_inttable",
            //     "name": "sample_inttable",
            //     "data": {
            //       "name": item,
            //       "description": file
            //     }
            //   }
            // }]);

            //token table
            // const tokenTable = await fileTokenTable("sample_inttable", "document", insert.results.sample_inttable[0].id, "write");

            //upload data
            // const formData = new FormData();
            // formData.append('file', buffer, {filename: file});
            // const submitPromise = util.promisify(formData.submit).bind(formData);
            // const submitOptions = {
            //   host: `${qore_url}`.replace('https://', ''),
            //   path: `/v1/files/upload?token=${tokenTable}`,
            //   headers: {
            //     'x-qore-engine-admin-secret': qore_secret,
            //   },
            // };
            // const res = await submitPromise(submitOptions);

            // if (Number(`${res.statusCode}`) >= 400) {
            //   throw new Error('Upload file failed');
            // }

            // return res;

          });
        } else {
          console.log('No files found in the folder.');
        }
      }

    });

    return { folders, files };
  } catch (error) {
    console.error('Error reading directory:', error.message);
    return { folders: [], files: [] };
  }
}


// Start the Bull worker process
queueUpload.process(async (job) => {
  const data = job.data
  console.log('Processing job with data:', data);
  
  //insert data
  const insert = await execute([{
    "operation": "Insert",
    "instruction": {
      "table": table,
      "name": table,
      "data": {
        "nama": data.nama,
        "nomor": data.nomor,
        "kategori" : data.kategori,
        "file_name" : data.file_name,
        "created_by" : user_id,
        "created_name" : nama_admin
      }
    }
  }]);

  // token table
  const tokenTable = await fileTokenTable(table, column, insert.results.sample_inttable[0].id, "write");

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

  // Perform the necessary task here
  console.log(`Job completed with data: ${job.data}`);
});

const worker = new Worker('uploadQueue', async job => {
  // This is the job processing logic
  console.log(`Processing job with data: ${job.data}`);
  // Simulate some async task
  await new Promise(resolve => setTimeout(resolve, 2000));
  return `Job completed with data: ${job.data}`;
});

worker.on('completed', job => {
  console.log(`Job ID ${job.id} has completed with result: ${job.returnvalue}`);
});

worker.on('failed', (job, err) => {
  console.error(`Job ID ${job.id} has failed with error: ${err.message}`);
});

exports.main = app;