const mongoClient = require('mongodb').MongoClient
const mongoAdapter = require('../mongoAdapter')

// Create a connection object with provided mocked out collection functions
const setUpConnMock = (mockCollFuncs) => (
  {
    url: 'mongodb://127.0.0.1:27017/BOX_SCORE',
    close: jest.fn(),
    db: jest.fn().mockReturnValueOnce({
      collection: jest.fn().mockReturnValueOnce(mockCollFuncs),
    }),
  }
)

// Set up for non-connect db functions
// Execute connection to set global consts
const setUp = async (collectionFuncs) => {
  const mockConnection = setUpConnMock(collectionFuncs)
  jest.spyOn(mongoClient, 'connect').mockResolvedValueOnce(mockConnection)
  await mongoAdapter.connect()
}

describe('mongoAdapter', () => {
  describe('#connect', () => {
    it('sets the connection and collection to the database upon success', async (done) => {
      const collectionFuncs = {}
      const connection = setUpConnMock(collectionFuncs)

      const mongoMock = jest.spyOn(mongoClient, 'connect').mockResolvedValueOnce(connection)
      const callback = () => { }

      let result
      try {
        result = await mongoAdapter.connect(callback)
      } catch (err) {
        done.fail('Failed to connect to mongo')
      }

      expect(mongoMock).toHaveBeenCalled()
      expect(mongoAdapter.getConnection()).toEqual(connection)
      expect(mongoAdapter.getGamesCollection()).toEqual(collectionFuncs)
      expect(result).toEqual(callback)
      done()
    })

    it('returns an error when the connection fails', async (done) => {
      const error = new Error('Failed to connect!')

      const mongoMock = jest.spyOn(mongoClient, 'connect').mockRejectedValueOnce(error)

      try {
        await mongoAdapter.connect()
        done.fail('Expected a connection error but got none')
      } catch (err) {
        expect(err).toEqual(error)
      }

      expect(mongoMock).toHaveBeenCalled()
      done()
    })
  })

  describe('#upsertGame', () => {
    it('should upsert the given game based on the src_id', async (done) => {
      const response = { result: { n: 1 } }
      const mockUpdate = jest.fn().mockResolvedValueOnce(response)
      await setUp({ updateOne: mockUpdate })

      const game = { src_id: '123', league: 'MLB' }
      try {
        await mongoAdapter.upsertGame(game)
      } catch (err) {
        done.fail(`Failed to save game due to: ${err}`)
      }

      const updateParams = mockUpdate.mock.calls[0]
      // eslint-disable-next-line camelcase
      const { updated_at, ...updateParamGame } = updateParams[1].$set

      expect(updateParams[0]).toEqual({ src_id: game.src_id })
      expect(updateParamGame).toEqual(game)
      expect(updateParams[2]).toEqual({ upsert: true })
      done()
    })

    it('should return an error if no game documents are affected', async (done) => {
      const response = { response: { n: 0 } }
      const mockUpdate = jest.fn().mockResolvedValueOnce(response)
      await setUp({ updateOne: mockUpdate })

      const game = { src_id: '123', league: 'MLB' }
      try {
        await mongoAdapter.upsertGame(game)
        done.fail('Expected upsert to fail but it did not.')
      } catch (err) {
        const updateParams = mockUpdate.mock.calls[0]
        // eslint-disable-next-line camelcase
        const { updated_at, ...updateParamGame } = updateParams[1].$set

        expect(updateParams[0]).toEqual({ src_id: game.src_id })
        expect(updateParamGame).toEqual(game)
        expect(updateParams[2]).toEqual({ upsert: true })
      }

      done()
    })

    it('should return an error if update fails', async (done) => {
      const error = new Error('BLAMO')
      const mockUpdate = jest.fn().mockRejectedValueOnce(error)
      await setUp({ updateOne: mockUpdate })

      const game = { src_id: '123', league: 'MLB' }
      try {
        await mongoAdapter.upsertGame(game)
        done.fail('Expected upsert to fail but it did not.')
      } catch (err) {
        const updateParams = mockUpdate.mock.calls[0]
        // eslint-disable-next-line camelcase
        const { updated_at, ...updateParamGame } = updateParams[1].$set

        expect(updateParams[0]).toEqual({ src_id: game.src_id })
        expect(updateParamGame).toEqual(game)
        expect(updateParams[2]).toEqual({ upsert: true })
      }

      done()
    })
  })

  describe('find functionality', () => {
    const mockSort = jest.fn()
    const setUpFindMock = (response) => {
      const mockFindResponse = {
        sort: mockSort.mockReturnValueOnce({
          toArray: jest.fn().mockResolvedValueOnce(response),
        }),
      }
      return jest.fn().mockReturnValueOnce(mockFindResponse)
    }
    describe('#findGames', () => {
      it('should return a collection of games for the given query', async (done) => {
        const game = { _id: '12345', league: 'MLB' }
        const mockFind = setUpFindMock([game])
        await setUp({ find: mockFind })

        const query = { league: 'MLB' }
        let result
        try {
          result = await mongoAdapter.findGames(query)
        } catch (err) {
          done.fail(`Failed to find games due to: ${err}`)
        }

        expect(mockFind).toHaveBeenCalledWith(query)
        expect(mockSort).toHaveBeenCalledWith({ _id: -1 })
        expect(result).toEqual([game])
        done()
      })

      it('should return an error if the query execution fails', async (done) => {
        const error = new Error('BLAMO')
        const mockFind = jest.fn().mockReturnValueOnce({
          sort: jest.fn().mockRejectedValueOnce(error),
        })
        await setUp({ find: mockFind })

        const query = { league: 'MLB' }
        try {
          await mongoAdapter.findGames(query)
          done.fail('Expected find to fail but it did not')
        } catch (err) {
          expect(err).toEqual(error)
        }

        done()
      })
    })

    describe('#findSingleGame', () => {
      it('should find a game in the collection that matches the provided event info', async (done) => {
        const game = { _id: '12345', league: 'MLB' }
        const mockFind = setUpFindMock([game])
        await setUp({ find: mockFind })

        const eventInfo = {
          temperature: 71,
          site: {
            capacity: 45050,
            surface: 'Grass',
            name: 'Angel Stadium of Anaheim',
            state: 'California',
            city: 'Anaheim',
          },
          attendance: 37916,
          duration: '3:03',
          status: 'completed',
          season_type: 'regular',
          start_date_time: '2012-09-26T19:05:00-07:00',
        }
        let result
        try {
          result = await mongoAdapter.findSingleGame(eventInfo)
        } catch (err) {
          done.fail(`Failed to find games due to: ${err}`)
        }

        expect(mockFind).toHaveBeenCalledWith(eventInfo)
        expect(mockSort).toHaveBeenCalledWith({ _id: -1 })
        expect(result).toEqual(game)
        done()
      })

      it('should return an error if the query fails', async (done) => {
        const error = new Error('BLAMO')
        const mockFind = jest.fn().mockReturnValueOnce({
          sort: jest.fn().mockRejectedValueOnce(error),
        })
        await setUp({ find: mockFind })

        const eventInfo = {
          temperature: 71,
          site: {
            capacity: 45050,
            name: 'Angel Stadium of Anaheim',
          },
          start_date_time: '2012-09-26T19:05:00-07:00',
        }
        try {
          await mongoAdapter.findSingleGame(eventInfo)
          done.fail('Expected find single game to fail but it did not')
        } catch (err) {
          expect(err).toEqual(error)
        }

        done()
      })
    })
  })

  describe('#clearGamesCollection', () => {
    it('should remove all documents from the games collection upon success', async (done) => {
      const mockDelete = jest.fn().mockResolvedValueOnce()
      await setUp({ deleteMany: mockDelete })

      try {
        await mongoAdapter.clearGamesCollection()
      } catch (err) {
        done.fail(`Failed to clear games collection due to: ${err}`)
      }

      expect(mockDelete).toHaveBeenCalled()
      done()
    })

    it('should return an error if the collection fails to clear', async (done) => {
      const error = new Error('BLAMO')
      const mockDelete = jest.fn().mockRejectedValueOnce(error)
      await setUp({ deleteMany: mockDelete })

      try {
        await mongoAdapter.clearGamesCollection()
        done.fail('Expected clear collection to fail but it did not')
      } catch (err) {
        expect(err).toEqual(error)
      }

      done()
    })
  })
})
