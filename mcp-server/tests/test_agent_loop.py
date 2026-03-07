import unittest
from unittest.mock import MagicMock, patch
import sys
import os

# Add parent directory to path to import api
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from api import AgentFixer

class TestAgentLoop(unittest.TestCase):
    def setUp(self):
        self.agent = AgentFixer()

    @patch('api.AgentFixer.generate_tests')
    @patch('api.AgentFixer.generate_fix')
    @patch('api.AgentFixer.verify_fix')
    def test_retry_loop_success_after_failure(self, mock_verify, mock_generate_fix, mock_generate_tests):
        """
        Test that the agent retries if the first verification fails, 
        and succeeds if the second verification passes against the SUITE.
        """
        # Setup Mocks
        mock_generate_tests.return_value = ["test2", "test3"] # generated tests
        
        # 1. Generate Fix: First returns "Bad Code", Second returns "Good Code"
        mock_generate_fix.side_effect = ["def solution(): return 'bad'", "def solution(): return 'good'"]
        
        # 2. Verify: First returns (False, "Error"), Second returns (True, "Success")
        mock_verify.side_effect = [(False, "Runtime Error: Bad Code"), (True, "Output: Success")]
        
        # Run
        result = self.agent.attempt_fix("def solution(): return 'buggy'", "Initial Error", "initial_test", max_retries=3)
        
        # Assertions
        self.assertTrue(result['verified'])
        self.assertEqual(result['attempts'], 2)
        self.assertEqual(result['test_count'], 3) # initial + 2 generated
        
        # Check that verify was called with ALL tests
        expected_suite = ["initial_test", "test2", "test3"]
        args1, _ = mock_verify.call_args_list[0]
        self.assertEqual(args1[1], expected_suite) # Verification 1 uses suite
        
        # Check generate fix calls
        self.assertEqual(mock_generate_fix.call_count, 2)

    @patch('api.AgentFixer.generate_tests')
    @patch('api.AgentFixer.generate_fix')
    @patch('api.AgentFixer.verify_fix')
    def test_retry_loop_fail_all(self, mock_verify, mock_generate_fix, mock_generate_tests):
        """
        Test that the agent gives up after max_retries.
        """
        mock_generate_tests.return_value = []
        mock_generate_fix.return_value = "def solution(): return 'still_bad'"
        mock_verify.return_value = (False, "Runtime Error: Still Bad")
        
        result = self.agent.attempt_fix("buggy", "error", "input", max_retries=2)
        
        self.assertFalse(result['verified'])
        self.assertEqual(len(result['history']), 2)
        self.assertEqual(mock_generate_fix.call_count, 2)

if __name__ == '__main__':
    unittest.main()
