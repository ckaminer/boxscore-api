const barstoolAdapter = require('../adapters/barstoolAdapter')
const mongoAdapter = require('../adapters/mongoAdapter')

const logger = require('../config/logging')

const getGameById = async (id) => {
  let game
  try {
    game = await mongoAdapter.findSingleGame({ src_id: id })
  } catch (err) {
    const logMessage = `[gameService - getGameById(${id}) - ${err.message}]`
    logger.log('error', logMessage)
  }

  // eslint-disable-next-line no-underscore-dangle
  const timestamp = game ? game.updated_at : 0
  const timeDiff = (Date.now() - timestamp) / 1000
  if (timeDiff > 15) {
    try {
      game = await barstoolAdapter.getGameById(id)
      await mongoAdapter.upsertGame({ src_id: id, ...game })
    } catch (err) {
      const logMessage = `[gameService - getGameById(${id}) - ${err.message}]`
      logger.log('error', logMessage)
      throw new Error(`Failed to retrieve game ${id}`)
    }
  }

  return game
}

const getGamesList = async (gameIds) => {
  let allGames = []

  const gamePromises = gameIds.map(id => (
    new Promise(async (resolve, reject) => {
      try {
        const games = await getGameById(id)
        allGames = allGames.concat(games)
        resolve()
      } catch (err) {
        reject(err)
      }
    })
  ))

  try {
    await Promise.all(gamePromises)
  } catch (err) {
    throw err
  }

  return allGames
}

module.exports = {
  getGameById,
  getGamesList,
}
